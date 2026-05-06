import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FunnelStep } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDbJsonArray } from '../../common/utils/json-db.util';
import { CrmService } from '../crm/crm.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CrmOrderStatus, OrderStatus } from './order.enums';

@Injectable()
export class OrderService {
  private readonly bypassCrmCheckout = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
  ) {}

  private async validatePublicFunnelContext(funnelId: number, funnelProductId: number) {
    if (!funnelProductId) {
      return;
    }

    const funnelProduct = await this.prisma.funnelProduct.findFirst({
      where: {
        id: funnelProductId,
        status: true,
        deletedAt: null,
        ...(funnelId > 0 ? { funnelId } : {}),
        funnel: {
          status: true,
          displayDefault: false,
          deletedAt: null,
        },
        product: {
          status: true,
          deletedAt: null,
        },
      },
      select: { id: true },
    });

    if (!funnelProduct) {
      throw new NotFoundException('Funnel product not found');
    }
  }

  async listAdminOrders(searchText?: string, status?: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        ...(status && status !== 'all'
          ? {
              OR: [
                { status: status as OrderStatus },
                { orderStatus: status as CrmOrderStatus },
              ],
            }
          : {}),
        ...(searchText
          ? {
              OR: [
                { customer: { firstName: { contains: searchText } } },
                { customer: { lastName: { contains: searchText } } },
                { customer: { email: { contains: searchText } } },
                {
                  items: {
                    some: {
                      productVariant: {
                        OR: [
                          { title: { contains: searchText } },
                          { variantName: { contains: searchText } },
                          { product: { name: { contains: searchText } } },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.normalizeBigInts(orders);
  }

  async getAdminOrderDetails(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                product: true,
              },
            },
          },
        },
        transactions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const variant = order.items[0]?.productVariant;
    const swappableProducts = variant
      ? await this.prisma.swappableProduct.findMany({
          where: { productId: variant.productId },
          include: { swapableProduct: true },
        })
      : [];

    return this.normalizeBigInts({ order, swappableProducts });
  }

  async createOrder(customerId: number, dto: CreateOrderDto) {
    const mapping = dto.mapping as Record<string, unknown>;
    const body = dto.body as Record<string, unknown>;
    const funnelId = Number(mapping.funnel_id ?? 0);
    const funnelProductId = Number(mapping.funnel_product_id ?? 0);
    const productVariantId = Number(body.varient_id ?? body.variant_id ?? 0);

    await this.validatePublicFunnelContext(funnelId, funnelProductId);

    if (!productVariantId) {
      throw new BadRequestException('Product variant is required.');
    }

    const isAllowed = await this.validateState(body, mapping);
    if (!isAllowed) {
      throw new BadRequestException(
        'This product is not available in your state. Please select a different state.',
      );
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: productVariantId },
      include: {
        product: true,
        crmOffer: true,
        crmCampaign: true,
        shippingProfile: true,
      },
    });

    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }

    const crmId = Number(mapping.crm_id ?? variant.crmOffer?.crmId ?? 0);
    const campaignId = String(
      variant.crmCampaign?.campaignId ?? '',
    ).trim();
    const offerId = String(variant.crmOffer?.offerId ?? '').trim();

    if (!this.bypassCrmCheckout && (!crmId || !campaignId || !offerId)) {
      throw new BadRequestException(
        'CRM configuration is incomplete for this product variant.',
      );
    }

    const [cardExpMonth, cardExpYear] = this.parseExpiry(
      String(body.card_exp_month ?? ''),
    );

    const crmCustomer = await this.prisma.crmCustomer.findFirst({
      where: { customerId, crmId },
    });

    const existingAuthorizedOrder = await this.prisma.order.findFirst({
      where: {
        customerId,
        funnelId,
        productGroupName: variant.product.productGroupName,
        orderStatus: CrmOrderStatus.authorized,
      },
      include: { items: true },
      orderBy: { id: 'desc' },
    });

    if (
      existingAuthorizedOrder?.items.some(
        (item) => item.productVariantId === variant.id,
      )
    ) {
      if (!this.bypassCrmCheckout) {
        throw new BadRequestException(
          'This product already has an authorized order for the customer.',
        );
      }

      if (funnelProductId > 0) {
        const existingProgress = await this.prisma.funnelProgress.findFirst({
          where: {
            customerId,
            funnelProductId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (existingProgress) {
          await this.prisma.funnelProgress.update({
            where: { id: existingProgress.id },
            data: { steps: FunnelStep.identity_upload },
          });
        } else {
          await this.prisma.funnelProgress.create({
            data: {
              customerId,
              funnelProductId,
              steps: FunnelStep.identity_upload,
              smsConsent: false,
            },
          });
        }
      }

      const existingOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: existingAuthorizedOrder.id },
        include: { items: true, transactions: true },
      });

      return this.normalizeBigInts(existingOrder);
    }

    const latestPendingOrder = await this.prisma.order.findFirst({
      where: {
        customerId,
        funnelId,
        productGroupName: variant.product.productGroupName,
        orderStatus: null,
      },
      include: { items: true },
      orderBy: { id: 'desc' },
    });

    const shippingAddressPayload = this.buildAddressPayload(body, 'ship');
    const billingAddressPayload = Boolean(body.same_address)
      ? { ...shippingAddressPayload }
      : this.buildAddressPayload(body, 'bill');

    const authorizationPayload = {
      crm_customer_id: crmCustomer?.crmCustomerId ?? null,
      first_name: shippingAddressPayload.fname,
      last_name: shippingAddressPayload.lname,
      email: String(body.email ?? customer.email ?? '').trim(),
      phone: String(body.phone ?? customer.phone ?? '').trim(),
      ship_fname: shippingAddressPayload.fname,
      ship_lname: shippingAddressPayload.lname,
      ship_address1: shippingAddressPayload.address1,
      ship_address2: shippingAddressPayload.address2,
      ship_city: shippingAddressPayload.city,
      ship_state: shippingAddressPayload.state,
      ship_zipcode: shippingAddressPayload.zipCode,
      ship_country: shippingAddressPayload.country,
      bill_fname: billingAddressPayload.fname,
      bill_lname: billingAddressPayload.lname,
      bill_address1: billingAddressPayload.address1,
      bill_address2: billingAddressPayload.address2,
      bill_city: billingAddressPayload.city,
      bill_state: billingAddressPayload.state,
      bill_zipcode: billingAddressPayload.zipCode,
      bill_country: billingAddressPayload.country,
      same_address: Boolean(body.same_address),
      card_number: String(body.card_number ?? ''),
      card_exp_month: cardExpMonth,
      card_exp_year: cardExpYear,
      card_cvv: String(body.card_cvv ?? '').trim(),
      offer_id: offerId,
    };

    let partialOrderResponse:
      | {
          data?: {
            order_id?: string | number;
            customer_id?: string | number;
            order_offers?: Array<{ order_offer_id?: string | number }>;
          };
        }
      | undefined;

    if (this.bypassCrmCheckout) {
      const mockOrderId = latestPendingOrder?.orderApiId ?? `LOCAL-${customerId}-${Date.now()}`;
      const mockOrderOfferId = `${Date.now()}`;
      partialOrderResponse = {
        data: {
          order_id: mockOrderId,
          customer_id: crmCustomer?.crmCustomerId ?? undefined,
          order_offers: [{ order_offer_id: mockOrderOfferId }],
        },
      };
    } else if (!latestPendingOrder?.orderApiId) {
      partialOrderResponse = (await this.crmService.createPartialOrder(
        crmId,
        authorizationPayload,
        {
          campaign_id: campaignId,
          offer_id: offerId,
          shipping_profile_id: variant.shippingProfile?.shippingProfileId ?? null,
        },
      )) as typeof partialOrderResponse;
    }

    const orderApiId = String(
      latestPendingOrder?.orderApiId ??
        partialOrderResponse?.data?.order_id ??
        '',
    ).trim();

    if (!orderApiId) {
      throw new BadRequestException('CRM partial order id was not returned.');
    }

    const authorizeResponse = this.bypassCrmCheckout
      ? ({
          data: {
            order_id: orderApiId,
            order: {
              order_offers: [
                {
                  order_offer_id:
                    partialOrderResponse?.data?.order_offers?.[0]?.order_offer_id ??
                    `${Date.now()}`,
                },
              ],
            },
            customer_id: crmCustomer?.crmCustomerId ?? null,
          },
        } as {
          data?: {
            order_id?: string | number;
            order?: {
              order_offers?: Array<{ order_offer_id?: string | number }>;
            };
            customer_id?: string | number;
          };
        })
      : ((await this.crmService.createOrder(
          crmId,
          authorizationPayload,
          {
            campaign_id: campaignId,
            offer_id: offerId,
            order_api_id: orderApiId,
            shipping_profile_id: variant.shippingProfile?.shippingProfileId ?? null,
          },
        )) as {
          data?: {
            order_id?: string | number;
            order?: {
              order_offers?: Array<{ order_offer_id?: string | number }>;
            };
            customer_id?: string | number;
          };
        });

    return this.prisma.$transaction(async (tx: any) => {
      const savedShippingAddress = await this.upsertAddress(
        tx,
        customerId,
        shippingAddressPayload,
        String(body.shipping_address_id ?? 'new'),
        'shipping',
      );
      const savedBillingAddress = await this.upsertAddress(
        tx,
        customerId,
        billingAddressPayload,
        String(body.billing_address_id ?? 'new'),
        'billing',
      );

      const order = latestPendingOrder
        ? await tx.order.update({
            where: { id: latestPendingOrder.id },
            data: {
              crmId,
              funnelId,
              orderApiId,
              orderOfferId: this.resolveOrderOfferId(
                authorizeResponse,
                partialOrderResponse,
                latestPendingOrder.orderOfferId,
              ),
              status: OrderStatus.partial,
              orderStatus: CrmOrderStatus.authorized,
              productGroupName: variant.product.productGroupName,
              grossPrice: variant.sellingPrice,
              totalPrice: variant.sellingPrice,
              shippingPrice: variant.shippingProfile?.shippingPrice ?? 0,
              tax: 0,
              discount: 0,
              email: authorizationPayload.email,
              phone: authorizationPayload.phone,
              billFname: billingAddressPayload.fname,
              billLname: billingAddressPayload.lname,
              billCountry: billingAddressPayload.country,
              billAddress1: billingAddressPayload.address1,
              billAddress2: billingAddressPayload.address2,
              billCity: billingAddressPayload.city,
              billState: billingAddressPayload.state,
              billZipcode: billingAddressPayload.zipCode,
              shippingSame: Boolean(body.same_address),
              shipFname: shippingAddressPayload.fname,
              shipLname: shippingAddressPayload.lname,
              shipCountry: shippingAddressPayload.country,
              shipAddress1: shippingAddressPayload.address1,
              shipAddress2: shippingAddressPayload.address2,
              shipCity: shippingAddressPayload.city,
              shipState: shippingAddressPayload.state,
              shipZipcode: shippingAddressPayload.zipCode,
              customerShippingAddressId: savedShippingAddress?.id ?? null,
              customerBillingAddressId: savedBillingAddress?.id ?? null,
            },
          })
        : await tx.order.create({
            data: {
              customerId,
              funnelId,
              crmId,
              orderApiId,
              orderOfferId: this.resolveOrderOfferId(
                authorizeResponse,
                partialOrderResponse,
                null,
              ),
              status: OrderStatus.partial,
              orderStatus: CrmOrderStatus.authorized,
              productGroupName: variant.product.productGroupName,
              grossPrice: variant.sellingPrice,
              totalPrice: variant.sellingPrice,
              shippingPrice: variant.shippingProfile?.shippingPrice ?? 0,
              tax: 0,
              discount: 0,
              email: authorizationPayload.email,
              phone: authorizationPayload.phone,
              billFname: billingAddressPayload.fname,
              billLname: billingAddressPayload.lname,
              billCountry: billingAddressPayload.country,
              billAddress1: billingAddressPayload.address1,
              billAddress2: billingAddressPayload.address2,
              billCity: billingAddressPayload.city,
              billState: billingAddressPayload.state,
              billZipcode: billingAddressPayload.zipCode,
              shippingSame: Boolean(body.same_address),
              shipFname: shippingAddressPayload.fname,
              shipLname: shippingAddressPayload.lname,
              shipCountry: shippingAddressPayload.country,
              shipAddress1: shippingAddressPayload.address1,
              shipAddress2: shippingAddressPayload.address2,
              shipCity: shippingAddressPayload.city,
              shipState: shippingAddressPayload.state,
              shipZipcode: shippingAddressPayload.zipCode,
              customerShippingAddressId: savedShippingAddress?.id ?? null,
              customerBillingAddressId: savedBillingAddress?.id ?? null,
            },
          });

      const nextCrmCustomerId = String(
        authorizeResponse?.data?.customer_id ??
          partialOrderResponse?.data?.customer_id ??
          crmCustomer?.crmCustomerId ??
          '',
      ).trim();

      if (nextCrmCustomerId) {
        const existingCrmCustomer = await tx.crmCustomer.findFirst({
          where: { customerId, crmId },
          select: { id: true },
        });

        if (existingCrmCustomer) {
          await tx.crmCustomer.update({
            where: { id: existingCrmCustomer.id },
            data: { crmCustomerId: nextCrmCustomerId },
          });
        } else {
          await tx.crmCustomer.create({
            data: {
              customerId,
              crmId,
              crmCustomerId: nextCrmCustomerId,
            },
          });
        }
      }

      const existingOrderItem = await tx.orderItem.findFirst({
        where: {
          orderId: order.id,
          productVariantId: variant.id,
        },
      });

      if (existingOrderItem) {
        await tx.orderItem.update({
          where: { id: existingOrderItem.id },
          data: {
            orderOfferId: this.toBigIntOrNull(order.orderOfferId),
            sellingPrice: variant.sellingPrice,
            totalPrice: variant.sellingPrice,
            shippingPrice: variant.shippingProfile?.shippingPrice ?? 0,
            tax: 0,
            discount: 0,
          },
        });
      } else {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            orderOfferId: this.toBigIntOrNull(order.orderOfferId),
            productVariantId: variant.id,
            sellingPrice: variant.sellingPrice,
            totalPrice: variant.sellingPrice,
            shippingPrice: variant.shippingProfile?.shippingPrice ?? 0,
            tax: 0,
            discount: 0,
          },
        });
      }

      if (funnelProductId > 0) {
        const existingProgress = await tx.funnelProgress.findFirst({
          where: {
            customerId,
            funnelProductId,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (existingProgress) {
          await tx.funnelProgress.update({
            where: { id: existingProgress.id },
            data: { steps: FunnelStep.identity_upload },
          });
        } else {
          await tx.funnelProgress.create({
            data: {
              customerId,
              funnelProductId,
              steps: FunnelStep.identity_upload,
              smsConsent: false,
            },
          });
        }
      }

      const savedOrder = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, transactions: true },
      });

      return this.normalizeBigInts(savedOrder);
    });
  }

  async captureAuthorizedOrder(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || !order.orderApiId || !order.crmId) {
      throw new NotFoundException('Authorized order not found');
    }

    await this.crmService.captureOrder(order.crmId, order.orderApiId);

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: { orderStatus: CrmOrderStatus.captured },
    });

    return this.normalizeBigInts(updatedOrder);
  }

  async validateCoupon(customerId: number, dto: ValidateCouponDto) {
    const variantId = Number((dto.body as Record<string, unknown>).varient_id);
    const coupon = String((dto.body as Record<string, unknown>).coupon ?? '');
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { crmOffer: true },
    });

    if (!variant?.crmOffer) {
      throw new NotFoundException('Product variant CRM offer not found');
    }

    const order = await this.prisma.order.findFirst({
      where: { customerId },
      orderBy: { id: 'desc' },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        discountCoupon: coupon,
      },
    });

    return {
      success: true,
      data: {
        is_valid: true,
        details: {
          offer_id: variant.crmOffer.offerId,
          coupon,
        },
      },
    };
  }

  async removeCoupon(customerId: number) {
    const order = await this.prisma.order.findFirst({
      where: { customerId },
      orderBy: { id: 'desc' },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        discountCoupon: null,
        totalPrice: order.grossPrice,
        discount: 0,
      },
    });

    return { success: true, data: [] };
  }

  async checkOfferEligibility(orderApiId: string) {
    const currentOrder = await this.prisma.order.findFirst({
      where: { orderApiId },
    });

    if (!currentOrder) {
      return { eligible: false, message: 'Order not found.' };
    }

    const hasAcceptedAnyOffer = await this.prisma.order.count({
      where: {
        customerId: currentOrder.customerId,
        offerApplied: { not: null },
      },
    });

    if (hasAcceptedAnyOffer) {
      return {
        eligible: false,
        message: 'You are not applicable for the offer',
      };
    }

    return { eligible: true, message: null };
  }

  async getOrdersForDashboard(
    customerId: number,
    filters: { status?: string; dateRange?: string },
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        ...(filters.status ? { status: filters.status as OrderStatus } : {}),
      },
      include: {
        items: { include: { productVariant: true } },
        customer: true,
        funnel: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.normalizeBigInts(orders);
  }

  async validateState(
    body: Record<string, unknown>,
    mapping: Record<string, unknown>,
  ): Promise<boolean> {
    let state = body.state ? String(body.state) : null;
    const shippingAddressId = body.shipping_address_id
      ? String(body.shipping_address_id)
      : null;

    if (!state && shippingAddressId && shippingAddressId !== 'new') {
      const address = await this.prisma.customerAddress.findUnique({
        where: { id: Number(shippingAddressId) },
      });
      state = address?.state ?? null;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: Number(mapping.product_id) },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const restricted = parseDbJsonArray(product.restrictedState);

    return state ? !restricted.includes(state) : true;
  }

  private parseExpiry(value: string) {
    const normalized = value.trim().replace(/[-\s]/g, '/');
    const [month = '', year = ''] = normalized.split('/');

    if (!month || !year) {
      throw new BadRequestException('Card expiry is required.');
    }

    return [
      month.padStart(2, '0'),
      (year.length === 4 ? year.slice(-2) : year).padStart(2, '0'),
    ];
  }

  private buildAddressPayload(
    body: Record<string, unknown>,
    prefix: 'ship' | 'bill',
  ) {
    return {
      fname: String(body[`${prefix}_fname`] ?? '').trim(),
      lname: String(body[`${prefix}_lname`] ?? '').trim(),
      address1: String(body[`${prefix}_address1`] ?? '').trim(),
      address2: String(body[`${prefix}_address2`] ?? '').trim(),
      city: String(body[`${prefix}_city`] ?? '').trim(),
      state: String(body[`${prefix}_state`] ?? '').trim(),
      zipCode: String(body[`${prefix}_zipcode`] ?? '').trim(),
      country: String(body[`${prefix}_country`] ?? 'US').trim() || 'US',
    };
  }

  private async upsertAddress(
    tx: any,
    customerId: number,
    payload: {
      fname: string;
      lname: string;
      address1: string;
      address2: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    },
    selectedId: string,
    type: 'shipping' | 'billing',
  ) {
    if (selectedId && selectedId !== 'new') {
      return tx.customerAddress.update({
        where: { id: Number(selectedId) },
        data: {
          fname: payload.fname,
          lname: payload.lname,
          address1: payload.address1,
          address2: payload.address2,
          city: payload.city,
          state: payload.state,
          zipCode: payload.zipCode,
          country: payload.country,
          type,
        },
      });
    }

    return tx.customerAddress.create({
      data: {
        customerId,
        fname: payload.fname,
        lname: payload.lname,
        address1: payload.address1,
        address2: payload.address2,
        city: payload.city,
        state: payload.state,
        zipCode: payload.zipCode,
        country: payload.country,
        type,
      },
    });
  }

  private resolveOrderOfferId(
    authorizeResponse:
      | {
          data?: {
            order?: { order_offers?: Array<{ order_offer_id?: string | number }> };
          };
        }
      | undefined,
    partialOrderResponse:
      | {
          data?: {
            order_offers?: Array<{ order_offer_id?: string | number }>;
          };
        }
      | undefined,
    fallback: string | null,
  ) {
    return String(
      authorizeResponse?.data?.order?.order_offers?.[0]?.order_offer_id ??
        partialOrderResponse?.data?.order_offers?.[0]?.order_offer_id ??
        fallback ??
        '',
    ).trim() || null;
  }

  private toBigIntOrNull(value: string | null) {
    return value ? BigInt(value) : null;
  }

  private normalizeBigInts<T>(value: T): T {
    if (typeof value === 'bigint') {
      return value.toString() as T;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeBigInts(item)) as T;
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          this.normalizeBigInts(nestedValue),
        ]),
      ) as T;
    }

    return value;
  }
}
