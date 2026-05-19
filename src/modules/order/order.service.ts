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
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CrmOrderStatus, OrderStatus } from './order.enums';
import { DocumentService } from '../document/document.service';
import { VerificationService } from '../verification/verification.service';

type OrderRequest = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string | null };
};

@Injectable()
export class OrderService {
  private readonly bypassCrmCheckout =
    String(process.env.BYPASS_CRM_CHECKOUT ?? '').trim().toLowerCase() ===
    'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
    private readonly documentService: DocumentService,
    private readonly verificationService: VerificationService,
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

  async createOrder(customerId: number, dto: CreateOrderDto, request?: OrderRequest) {
    const mapping = dto.mapping as Record<string, unknown>;
    const body = dto.body as Record<string, unknown>;
    const funnelId = Number(mapping.funnel_id ?? 0);
    const funnelProductId = Number(mapping.funnel_product_id ?? 0);
    const productVariantId = Number(body.varient_id ?? body.variant_id ?? 0);

    await this.validatePublicFunnelContext(funnelId, funnelProductId);

    if (!productVariantId) {
      throw new BadRequestException('Product variant is required.');
    }

    this.validatePaymentDetails(body);

    const isAllowed = await this.validateState(body, mapping);
    if (!isAllowed) {
      throw new BadRequestException(
        'This product is not available in your state. Please select a different state.',
      );
    }

    if (String(body.shipping_address_id ?? 'new') === 'new') {
      const addressVerification = await this.verificationService.validateAddress({
        address1: String(body.ship_address1 ?? '').trim(),
        address2: String(body.ship_address2 ?? '').trim() || null,
        city: String(body.ship_city ?? '').trim() || null,
        state: String(body.ship_state ?? body.state ?? '').trim(),
        zipCode: String(body.ship_zipcode ?? '').trim() || null,
        country: String(body.ship_country ?? 'US').trim() || 'US',
      });

      if (!addressVerification.isValid) {
        throw new BadRequestException(
          addressVerification.message ||
            'Shipping address could not be verified. Please review it.',
        );
      }
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
      String(body.card_exp_year ?? ''),
    );

    const crmCustomer = await this.prisma.crmCustomer.findFirst({
      where: { customerId, crmId },
    });
    const selectedShippingAddress = await this.resolveSelectedAddress(
      customerId,
      body.shipping_address_id,
    );
    const selectedBillingAddress = Boolean(body.same_address)
      ? selectedShippingAddress
      : await this.resolveSelectedAddress(customerId, body.billing_address_id);

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

      const existingOrder = await this.prisma.order.findUniqueOrThrow({
        where: { id: existingAuthorizedOrder.id },
        include: { items: true, transactions: true },
      });

      const nextStep = await this.resolveNextCheckoutStep(
        customerId,
        variant.id,
        funnelProductId,
        this.isSupplementProduct(variant.product.productClassification),
      );

      return this.normalizeBigInts({
        order: existingOrder,
        nextStep,
      });
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

    const shippingAddressPayload = this.mergeAddressPayload(
      this.buildAddressPayload(body, 'ship'),
      selectedShippingAddress,
    );
    const billingAddressPayload = Boolean(body.same_address)
      ? { ...shippingAddressPayload }
      : this.mergeAddressPayload(
          this.buildAddressPayload(body, 'bill'),
          selectedBillingAddress,
        );

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
      customers_address_shipping_id:
        selectedShippingAddress?.crmAddressId ?? null,
      customers_address_billing_id:
        selectedBillingAddress?.crmAddressId ??
        (Boolean(body.same_address)
          ? selectedShippingAddress?.crmAddressId ?? null
          : null),
      ip_address: this.extractClientIp(request),
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
        this.crmValue(partialOrderResponse, 'order_id') ??
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

    const createdOrder = await this.prisma.$transaction(async (tx: any) => {
      const savedShippingAddress = await this.upsertAddress(
        tx,
        customerId,
        shippingAddressPayload,
        String(body.shipping_address_id ?? 'new'),
        'shipping',
        this.extractCrmAddressId(authorizeResponse, 'shipping') ??
          selectedShippingAddress?.crmAddressId ??
          null,
      );
      const savedBillingAddress = await this.upsertAddress(
        tx,
        customerId,
        billingAddressPayload,
        String(body.billing_address_id ?? 'new'),
        'billing',
        this.extractCrmAddressId(authorizeResponse, 'billing') ??
          selectedBillingAddress?.crmAddressId ??
          (Boolean(body.same_address)
            ? this.extractCrmAddressId(authorizeResponse, 'shipping') ??
              selectedShippingAddress?.crmAddressId ??
              null
            : null),
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
        this.crmValue(authorizeResponse, 'customer_id') ??
          this.crmValue(partialOrderResponse, 'customer_id') ??
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

      let savedOrder = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, transactions: true },
      });

      if (this.isSupplementProduct(variant.product.productClassification)) {
        if (this.bypassCrmCheckout) {
          savedOrder = await tx.order.update({
            where: { id: order.id },
            data: {
              orderStatus: CrmOrderStatus.captured,
              expiresAt: this.plusOneYear(savedOrder.createdAt ?? new Date()),
            },
            include: { items: true, transactions: true },
          });
        }
      }

      return savedOrder;
    });

    if (
      this.isSupplementProduct(variant.product.productClassification) &&
      !this.bypassCrmCheckout
    ) {
      await this.captureAuthorizedOrder(createdOrder.id);
    }

    const refreshedOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: createdOrder.id },
      include: { items: true, transactions: true },
    });
    const nextStep = await this.resolveNextCheckoutStep(
      customerId,
      variant.id,
      funnelProductId,
      this.isSupplementProduct(variant.product.productClassification),
    );

    return this.normalizeBigInts({
      order: refreshedOrder,
      nextStep,
    });
  }

  async submitSwapOrder(
    customerId: number,
    orderId: number,
    dto: CreateSwapOrderDto,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        customer: true,
        funnel: {
          select: {
            swappableCampaignId: true,
          },
        },
        shippingAddress: true,
        billingAddress: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const planVariantPrice = await this.prisma.planVariantPrice.findFirst({
      where: {
        productVariantId: dto.productVariantId,
        planId: dto.planId,
      },
      include: {
        productVariant: {
          include: {
            product: true,
            crmOffer: true,
            crmCampaign: true,
          },
        },
        crmCampaign: true,
        crmOffer: true,
        crmShipping: true,
        subscriptionPlan: true,
      },
    });

    if (!planVariantPrice?.productVariant?.product) {
      throw new NotFoundException('Swap product plan not found');
    }

    const questionnaireId =
      dto.questionnaireId ??
      planVariantPrice.productVariant.product.changeMedicineQuestionId ??
      null;

    if (!questionnaireId) {
      throw new BadRequestException('Swap questionnaire not found.');
    }

    const savedAnswer = await this.prisma.answer.findFirst({
      where: {
        customerId,
        questionaryId: questionnaireId,
      },
      orderBy: { id: 'desc' },
    });

    if (!savedAnswer) {
      throw new BadRequestException('Swap questionnaire answers not found.');
    }

    const now = new Date();
    const shippingPrice = Number(planVariantPrice.crmShipping?.shippingPrice ?? 0);
    const itemPrice = Number(planVariantPrice.originalPrice ?? 0);
    const totalPrice = itemPrice + shippingPrice;
    const crmId = Number(order.crmId ?? 0) || null;
    const swapCampaignId =
      order.funnel?.swappableCampaignId
        ? await this.prisma.crmCampaign.findUnique({
            where: { id: order.funnel.swappableCampaignId },
            select: { campaignId: true },
          }).then((row) => row?.campaignId ?? null)
        : null;
    const fallbackCampaignId =
      planVariantPrice.crmCampaign?.campaignId ??
      planVariantPrice.productVariant.crmCampaign?.campaignId ??
      null;
    const campaignId = swapCampaignId ?? fallbackCampaignId;
    const offerId =
      planVariantPrice.crmOffer?.offerId ??
      planVariantPrice.productVariant.crmOffer?.offerId ??
      null;

    if (!this.bypassCrmCheckout) {
      if (!crmId || !order.orderApiId || !order.orderOfferId) {
        throw new BadRequestException('Original CRM order information is missing.');
      }

      if (!campaignId || !offerId) {
        throw new BadRequestException('Swap CRM campaign or offer mapping is missing.');
      }
    }

    let authorizeResponse:
      | {
          data?: {
            order_id?: string | number;
            order?: {
              order_offers?: Array<{ order_offer_id?: string | number }>;
            };
          };
        }
      | undefined;

    if (this.bypassCrmCheckout) {
      authorizeResponse = {
        data: {
          order_id: `SWAP-${customerId}-${Date.now()}`,
          order: {
            order_offers: [{ order_offer_id: `${Date.now()}` }],
          },
        },
      };
    } else {
      const orderDetails = (await this.crmService.getOrderDetails(
        crmId!,
        order.orderApiId!,
      )) as Record<string, unknown>;
      const customerResponse = this.extractSwapCustomerResponse(orderDetails);
      const customerCards = (await this.crmService.getCustomerCards(
        crmId!,
        String(customerResponse.customerId),
      )) as Record<string, unknown>;
      const card = this.extractPrimarySwapCard(customerCards);

      if (!customerResponse.paymentMethodId || !customerResponse.customerId) {
        throw new BadRequestException('Saved CRM payment method was not found.');
      }

      if (!card.customerCardId) {
        throw new BadRequestException('Saved CRM customer card was not found.');
      }

      await this.crmService.cancelOrder(crmId!, order.orderOfferId!);
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.swapped,
        },
      });

      authorizeResponse = (await this.crmService.createSwapAuthorizeOrder(
        crmId!,
        {
          payment_method_id: customerResponse.paymentMethodId,
          crm_customer_id: customerResponse.customerId,
          customer_card_id: card.customerCardId,
          card_type_id: card.cardTypeId,
          customers_address_billing_id: order.billingAddress?.crmAddressId ?? null,
          customers_address_shipping_id: order.shippingAddress?.crmAddressId ?? null,
          total: totalPrice,
          shipping_price: shippingPrice,
        },
        {
          campaign_id: campaignId,
          offer_id: offerId,
          shipping_profile_id: planVariantPrice.crmShipping?.shippingProfileId ?? null,
        },
      )) as typeof authorizeResponse;
    }

    const createdOrder = await this.prisma.$transaction(async (tx: any) => {
      if (this.bypassCrmCheckout) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.swapped,
          },
        });
      }

      const nextOrder = await tx.order.create({
        data: {
          customerId,
          parentId: order.id,
          funnelId: order.funnelId,
          crmId,
          orderApiId: String(authorizeResponse?.data?.order_id ?? '').trim() || `SWAP-${customerId}-${Date.now()}`,
          orderOfferId: this.resolveOrderOfferId(authorizeResponse, undefined, null),
          status: OrderStatus.partial,
          orderStatus: CrmOrderStatus.authorized,
          productGroupName: planVariantPrice.productVariant.product.productGroupName,
          grossPrice: itemPrice,
          totalPrice,
          shippingPrice,
          tax: 0,
          discount: 0,
          email: order.email,
          phone: order.phone,
          billFname: order.billFname,
          billLname: order.billLname,
          billCountry: order.billCountry,
          billAddress1: order.billAddress1,
          billAddress2: order.billAddress2,
          billCity: order.billCity,
          billState: order.billState,
          billZipcode: order.billZipcode,
          shippingSame: order.shippingSame,
          shipFname: order.shipFname,
          shipLname: order.shipLname,
          shipCountry: order.shipCountry,
          shipAddress1: order.shipAddress1,
          shipAddress2: order.shipAddress2,
          shipCity: order.shipCity,
          shipState: order.shipState,
          shipZipcode: order.shipZipcode,
          customerShippingAddressId: order.customerShippingAddressId,
          customerBillingAddressId: order.customerBillingAddressId,
          createdAt: now,
          updatedAt: now,
        },
      });

      const nextItem = await tx.orderItem.create({
        data: {
          orderId: nextOrder.id,
          orderOfferId: this.toBigIntOrNull(nextOrder.orderOfferId),
          productVariantId: planVariantPrice.productVariantId,
          sellingPrice: itemPrice,
          totalPrice: itemPrice,
          shippingPrice,
          tax: 0,
          discount: 0,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.$executeRaw`
        UPDATE order_items
        SET plan_id = ${dto.planId}
        WHERE id = ${nextItem.id}
      `;

      return nextOrder;
    });

    const userCase = await this.documentService.createCaseForCustomer(
      customerId,
      dto.productVariantId,
      true,
    );

    if (!userCase?.success) {
      throw new BadRequestException(
        typeof userCase?.message === 'string' && userCase.message.trim()
          ? userCase.message
          : 'CASE_CREATION_FAILED',
      );
    }

    return this.normalizeBigInts({
      success: true,
      orderId: createdOrder.id,
      userCase,
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

    const orderDetails = (await this.crmService.getOrderDetails(
      order.crmId,
      order.orderApiId,
    )) as Record<string, unknown>;
    const nextBillingAt = this.extractNextBillingAt(orderDetails);

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        orderStatus: CrmOrderStatus.captured,
        ...(nextBillingAt ? { nextBillingAt } : {}),
      },
    });

    return this.normalizeBigInts(updatedOrder);
  }

  async cancelOrderFromDoctorNetwork(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        transactions: {
          where: { deletedAt: null },
          orderBy: { id: 'desc' },
        },
      },
    });

    if (!order || !order.crmId || !order.orderOfferId) {
      throw new NotFoundException('Order not found');
    }

    await this.crmService.cancelOrder(order.crmId, order.orderOfferId);

    if (order.orderStatus === CrmOrderStatus.captured) {
      const capturedTransaction = order.transactions.find(
        (transaction) =>
          String(transaction.transactionTypeId ?? '').trim() === '7' &&
          transaction.transactionId &&
          transaction.transactionTotal,
      );

      if (capturedTransaction?.transactionId && capturedTransaction.transactionTotal) {
        try {
          await this.crmService.refundOrder(
            order.crmId,
            String(capturedTransaction.transactionId),
            capturedTransaction.transactionTotal,
          );
        } catch {
          // PHP keeps the local order cancellation even if the refund leg fails.
        }
      }
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.cancelled,
      },
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

  private parseExpiry(value: string, explicitYear?: string) {
    const normalizedMonth = value.trim();
    const normalizedYear = String(explicitYear ?? '').trim();
    const hasExplicitYear = normalizedYear.length > 0;

    let month = normalizedMonth;
    let year = normalizedYear;

    if (!hasExplicitYear) {
      const normalized = normalizedMonth.replace(/[-\s]/g, '/');
      [month = '', year = ''] = normalized.split('/');
    }

    if (!month || !year) {
      throw new BadRequestException('Card expiry is required.');
    }

    const monthDigits = month.replace(/\D+/g, '');
    const yearDigits = year.replace(/\D+/g, '');

    if (!/^\d{1,2}$/.test(monthDigits)) {
      throw new BadRequestException('Card expiry month is invalid.');
    }

    const monthNumber = Number(monthDigits);
    if (monthNumber < 1 || monthNumber > 12) {
      throw new BadRequestException('Card expiry month is invalid.');
    }

    if (!/^\d{2}$|^\d{4}$/.test(yearDigits)) {
      throw new BadRequestException('Card expiry year is invalid.');
    }

    return [
      monthDigits.padStart(2, '0'),
      (yearDigits.length === 4 ? yearDigits.slice(-2) : yearDigits).padStart(2, '0'),
    ];
  }

  private validatePaymentDetails(body: Record<string, unknown>) {
    const cardName = String(body.card_name ?? '').trim();
    const cardNumber = String(body.card_number ?? '').replace(/\D+/g, '');
    const cardCvv = String(body.card_cvv ?? '').replace(/\D+/g, '');
    const cardTypeId = this.detectSupportedCardType(cardNumber);

    if (!cardName) {
      throw new BadRequestException('Name on card is required.');
    }

    if (cardNumber.length < 13 || cardNumber.length > 19) {
      throw new BadRequestException('Card number must be between 13 and 19 digits.');
    }

    if (!cardTypeId) {
      throw new BadRequestException(
        'Card number is invalid or unsupported. Use a valid Visa, Mastercard, Discover, or Amex card.',
      );
    }

    if (!this.passesLuhn(cardNumber)) {
      throw new BadRequestException('Card number is invalid.');
    }

    if (cardCvv.length < 3 || cardCvv.length > 4) {
      throw new BadRequestException('Card CVV must be 3 or 4 digits.');
    }
  }

  private detectSupportedCardType(number: string): number | null {
    const normalized = number.replace(/\D+/g, '');

    if (/^(5[1-5][0-9]{14}|2(2[2-9][0-9]{2}|[3-6][0-9]{3}|7([01][0-9]{2}|20))[0-9]{10})$/.test(normalized)) {
      return 1;
    }
    if (/^4[0-9]{12}(?:[0-9]{3})?$/.test(normalized)) {
      return 2;
    }
    if (/^(6011|65|64[4-9])[0-9]{12,15}$/.test(normalized)) {
      return 3;
    }
    if (/^3[47][0-9]{13}$/.test(normalized)) {
      return 4;
    }

    return null;
  }

  private passesLuhn(number: string) {
    let sum = 0;
    let shouldDouble = false;

    for (let index = number.length - 1; index >= 0; index -= 1) {
      let digit = Number(number[index] ?? 0);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  private extractClientIp(request?: OrderRequest) {
    const forwarded = request?.headers?.['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === 'string'
        ? forwarded.split(',')[0]
        : '';
    const realIp =
      typeof request?.headers?.['x-real-ip'] === 'string'
        ? request.headers['x-real-ip']
        : '';
    const socketIp = request?.ip ?? request?.socket?.remoteAddress ?? '';

    return [forwardedValue, realIp, socketIp]
      .map((value) => String(value ?? '').trim())
      .find(Boolean) ?? null;
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

  private mergeAddressPayload(
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
    savedAddress:
      | {
          fname: string;
          lname: string;
          address1: string;
          address2: string | null;
          city: string | null;
          state: string;
          zipCode: string | null;
          country: string;
        }
      | null,
  ) {
    if (!savedAddress) {
      return payload;
    }

    return {
      fname: payload.fname || savedAddress.fname,
      lname: payload.lname || savedAddress.lname,
      address1: payload.address1 || savedAddress.address1,
      address2: payload.address2 || savedAddress.address2 || '',
      city: payload.city || savedAddress.city || '',
      state: payload.state || savedAddress.state,
      zipCode: payload.zipCode || savedAddress.zipCode || '',
      country: payload.country || savedAddress.country || 'US',
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
    crmAddressId: string | null,
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
          crmAddressId,
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
        crmAddressId,
      },
    });
  }

  private async resolveSelectedAddress(
    customerId: number,
    selectedId: unknown,
  ) {
    const normalizedId = String(selectedId ?? '').trim();
    if (!normalizedId || normalizedId === 'new') {
      return null;
    }

    return this.prisma.customerAddress.findFirst({
      where: {
        id: Number(normalizedId),
        customerId,
      },
    });
  }

  private extractCrmAddressId(
    response:
      | {
          data?: Record<string, unknown>;
        }
      | undefined,
    type: 'shipping' | 'billing',
  ) {
    const root = this.crmRoot(response);
    const candidates = [
      root,
      (root?.order as Record<string, unknown> | undefined) ?? undefined,
    ];
    const keys =
      type === 'shipping'
        ? ['customers_address_shipping_id', 'customer_address_shipping_id']
        : ['customers_address_billing_id', 'customer_address_billing_id'];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      for (const key of keys) {
        const value = candidate[key];
        if (value !== null && value !== undefined && String(value).trim()) {
          return String(value).trim();
        }
      }
    }

    return null;
  }

  private async resolveNextCheckoutStep(
    customerId: number,
    productVariantId: number,
    funnelProductId: number,
    isSupplement: boolean,
  ) {
    if (isSupplement) {
      await this.updateFunnelProgressStep(
        customerId,
        funnelProductId,
        FunnelStep.dashboard,
      );
      return 'dashboard' as const;
    }

    const nextStep = await this.documentService.resolvePostCheckoutStep(
      customerId,
      productVariantId,
    );
    await this.updateFunnelProgressStep(customerId, funnelProductId, nextStep);
    return nextStep;
  }

  private async updateFunnelProgressStep(
    customerId: number,
    funnelProductId: number,
    step: FunnelStep,
  ) {
    if (!funnelProductId) {
      return;
    }

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
        data: { steps: step },
      });
      return;
    }

    await this.prisma.funnelProgress.create({
      data: {
        customerId,
        funnelProductId,
        steps: step,
        smsConsent: false,
      },
    });
  }

  private isSupplementProduct(classification: unknown) {
    return String(classification ?? '').trim().toLowerCase() === 'supplement';
  }

  private plusOneYear(date: Date) {
    const nextDate = new Date(date);
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return nextDate;
  }

  private extractNextBillingAt(source: Record<string, unknown>) {
    const data =
      source?.data && typeof source.data === 'object'
        ? (source.data as Record<string, unknown>)
        : source;
    const transactions = Array.isArray(data.transactions)
      ? data.transactions
      : [];
    const lastTransaction =
      transactions.length > 0
        ? (transactions[transactions.length - 1] as Record<string, unknown>)
        : null;
    const scheduled =
      String(
        lastTransaction?.date_scheduled ?? data.nextBillDate ?? '',
      ).trim() || null;

    if (!scheduled) {
      return null;
    }

    const parsed = new Date(scheduled);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    const authorizeRoot = this.crmRoot(authorizeResponse);
    const partialRoot = this.crmRoot(partialOrderResponse);
    const authorizeOrderOffers = Array.isArray(authorizeRoot?.order_offers)
      ? authorizeRoot.order_offers
      : [];
    const partialOrderOffers = Array.isArray(partialRoot?.order_offers)
      ? partialRoot.order_offers
      : [];
    const nestedAuthorizeOrderOffers = Array.isArray(
      (authorizeRoot?.order as Record<string, unknown> | undefined)?.order_offers,
    )
      ? ((authorizeRoot?.order as Record<string, unknown>).order_offers as Array<
          Record<string, unknown>
        >)
      : [];

    return (
      String(
        nestedAuthorizeOrderOffers[0]?.order_offer_id ??
          (authorizeOrderOffers[0] as Record<string, unknown> | undefined)
            ?.order_offer_id ??
          (partialOrderOffers[0] as Record<string, unknown> | undefined)
            ?.order_offer_id ??
          fallback ??
          '',
      ).trim() || null
    );
  }

  private crmRoot(
    response:
      | {
          data?: Record<string, unknown>;
        }
      | undefined,
  ) {
    if (!response) {
      return undefined;
    }

    const direct = response as Record<string, unknown>;
    if ('order_id' in direct || 'order_offers' in direct || 'customer_id' in direct) {
      return direct;
    }

    return response.data;
  }

  private crmValue(
    response:
      | {
          data?: Record<string, unknown>;
        }
      | undefined,
    key: string,
  ) {
    const root = this.crmRoot(response);
    return root?.[key];
  }

  private extractSwapCustomerResponse(source: Record<string, unknown>) {
    const candidates = [
      source?.data,
      source,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const paymentMethodId = Number(
        (candidate as Record<string, unknown>).payment_method_id ??
          (candidate as Record<string, unknown>).paymentMethodId ??
          0,
      ) || null;
      const customerId = Number(
        (candidate as Record<string, unknown>).crmCustomerId ??
          (candidate as Record<string, unknown>).customer_id ??
          (candidate as Record<string, unknown>).customerId ??
          0,
      ) || null;

      if (paymentMethodId || customerId) {
        return {
          paymentMethodId,
          customerId,
        };
      }
    }

    return {
      paymentMethodId: null,
      customerId: null,
    };
  }

  private extractPrimarySwapCard(source: Record<string, unknown>) {
    const candidates = [
      source?.data,
      source,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const cards = (candidate as Record<string, unknown>).customer_cards;
      const firstCard = Array.isArray(cards) ? cards[0] : null;

      if (!firstCard || typeof firstCard !== 'object') {
        continue;
      }

      return {
        customerCardId:
          (firstCard as Record<string, unknown>).customer_card_id ?? null,
        cardTypeId:
          (firstCard as Record<string, unknown>).card_type_id ?? null,
      };
    }

    return {
      customerCardId: null,
      cardTypeId: null,
    };
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
