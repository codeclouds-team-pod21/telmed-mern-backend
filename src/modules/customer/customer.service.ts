import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeBigInts } from '../../common/utils/bigint.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { UpsertCustomerAddressDto } from './dto/upsert-customer-address.dto';
import { CreateFunnelCustomerDto } from './dto/create-funnel-customer.dto';
import { hashCustomerPassword } from './customer-password.util';
import { CrmOrderStatus, FunnelStep, OrderStatus } from '@prisma/client';
import { safeParseDbJson } from '../../common/utils/json-db.util';
import { CrmService } from '../crm/crm.service';
import { VerificationService } from '../verification/verification.service';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
    private readonly verificationService: VerificationService,
  ) {}

  private async ensurePublicFunnelProduct(funnelProductId: number) {
    const funnelProduct = await this.prisma.funnelProduct.findFirst({
      where: {
        id: funnelProductId,
        status: true,
        deletedAt: null,
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
      select: {
        id: true,
        product: {
          select: {
            productClassification: true,
            productGroupName: true,
          },
        },
      },
    });

    if (!funnelProduct) {
      throw new NotFoundException('Funnel product not found');
    }

    return funnelProduct;
  }

  async listAdminCustomers(searchText?: string, status?: boolean) {
    const customers = await this.prisma.customer.findMany({
      where: {
        ...(typeof status === 'boolean' ? { status } : {}),
        ...(searchText
          ? {
              OR: [
                { email: { contains: searchText } },
                { firstName: { contains: searchText } },
                { lastName: { contains: searchText } },
                { phone: { contains: searchText } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            addresses: true,
            orders: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    return normalizeBigInts(
      customers.map((customer) => ({
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        createdAt: customer.createdAt,
        addressCount: customer._count.addresses,
        orderCount: customer._count.orders,
      })),
    );
  }

  async createFunnelCustomer(dto: CreateFunnelCustomerDto) {
    const email = dto.email.trim().toLowerCase();
    const funnelProduct = dto.funnelProductId
      ? await this.ensurePublicFunnelProduct(dto.funnelProductId)
      : null;
    const emailVerification = await this.verificationService.verifyEmail(email);

    if (!emailVerification.isValid) {
      throw new BadRequestException(
        emailVerification.message || 'Please enter a valid email address.',
      );
    }

    const existing = await this.prisma.customer.findUnique({
      where: { email },
    });

    if (existing) {
      if (funnelProduct?.product?.productGroupName) {
        const conflictingOrder = await this.prisma.order.findFirst({
          where: {
            customerId: existing.id,
            productGroupName: funnelProduct.product.productGroupName,
            OR: [
              {
                orderStatus: CrmOrderStatus.authorized,
              },
              {
                orderStatus: CrmOrderStatus.captured,
                status: {
                  in: [OrderStatus.partial, OrderStatus.active, OrderStatus.complete],
                },
              },
            ],
          },
          select: {
            id: true,
            status: true,
            orderStatus: true,
          },
          orderBy: { id: 'desc' },
        });

        if (conflictingOrder) {
          throw new ConflictException(
            'You already have an active or in-progress order for this treatment type. Please continue with your existing account.',
          );
        }
      }

      throw new ConflictException(
        'This account already exists. Please sign in to continue.',
      );
    }

    const customer = await this.prisma.customer.create({
      data: {
        email,
        password: hashCustomerPassword(dto.password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        phone: dto.phone ? dto.phone.replace(/\D/g, '').slice(0, 15) : null,
        metadata: dto.state ? JSON.stringify({ state: dto.state }) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.upsertFunnelProgress(customer.id, dto.funnelProductId, funnelProduct);

    return normalizeBigInts({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      },
    });
  }

  private async upsertFunnelProgress(
    customerId: number,
    funnelProductId?: number,
    funnelProduct?: Awaited<ReturnType<CustomerService['ensurePublicFunnelProduct']>> | null,
  ) {
    if (!funnelProductId) {
      return;
    }

    const resolvedFunnelProduct =
      funnelProduct ?? (await this.ensurePublicFunnelProduct(funnelProductId));
    const nextStep =
      String(resolvedFunnelProduct.product?.productClassification) === 'supplement'
        ? FunnelStep.checkout
        : FunnelStep.medical_question;

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
        data: { steps: nextStep },
      });
      return;
    }

    await this.prisma.funnelProgress.create({
      data: {
        customerId,
        funnelProductId,
        steps: nextStep,
        smsConsent: false,
      },
    });
  }

  async getDashboard(customerId: number, status?: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        items: {
          include: {
            productVariant: {
              include: { product: true },
            },
          },
        },
        funnel: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return normalizeBigInts({
      orders,
      portalConfiguration: await this.prisma.portalConfiguration.findFirst(),
    });
  }

  async getProfile(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        addresses: { orderBy: { id: 'desc' } },
        crmCustomers: { include: { crm: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return normalizeBigInts({
      customer,
      portalConfiguration: await this.prisma.portalConfiguration.findFirst(),
    });
  }

  async getFunnelProgress(customerId: number, funnelProductId: number) {
    await this.ensurePublicFunnelProduct(funnelProductId);

    const progress = await this.prisma.funnelProgress.findFirst({
      where: {
        customerId,
        funnelProductId,
        deletedAt: null,
      },
      orderBy: { id: 'desc' },
    });

    const vitalsAnswer = await this.prisma.answer.findFirst({
      where: {
        customerId,
        questionnaire: {
          type: 'vitals' as never,
        },
      },
      select: { id: true },
      orderBy: { id: 'desc' },
    });

    const medicalAnswer = await this.prisma.answer.findFirst({
      where: {
        customerId,
        questionnaire: {
          type: 'medical' as never,
        },
      },
      select: { id: true },
      orderBy: { id: 'desc' },
    });

    return normalizeBigInts({
      progress,
      hasVitalsAnswer: Boolean(vitalsAnswer),
      hasMedicalAnswer: Boolean(medicalAnswer),
    });
  }

  async updateProfile(customerId: number, dto: UpdateCustomerProfileDto) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
      },
    });

    return normalizeBigInts({ success: true, customer });
  }

  async upsertAddress(customerId: number, dto: UpsertCustomerAddressDto) {
    const existing = dto.id
      ? await this.prisma.customerAddress.findFirst({
          where: { id: dto.id, customerId },
        })
      : null;

    const data = {
      customerId,
      fname: dto.fname,
      lname: dto.lname,
      address1: dto.address1,
      address2: dto.address2 ?? null,
      country: dto.country,
      state: dto.state,
      city: dto.city,
      zipCode: dto.zipCode,
      makeDefault: dto.makeDefault ?? false,
      type: dto.type ?? 'shipping',
      crmAddressId: dto.crmAddressId ?? null,
    };

    const address = existing
      ? await this.prisma.customerAddress.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.customerAddress.create({ data });

    return normalizeBigInts({ success: true, address });
  }

  async deleteAddress(customerId: number, addressId: number) {
    const address = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    return { success: true };
  }

  async getTreatmentDetails(customerId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        customer: true,
        items: {
          include: {
            productVariant: {
              include: { product: true },
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

    return normalizeBigInts({ order, swappableProducts });
  }

  async getSwapOptions(customerId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        customer: true,
        items: {
          include: {
            productVariant: {
              include: {
                product: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const currentItem = order.items[0];
    const currentVariant = currentItem?.productVariant;
    const currentProduct = currentVariant?.product;

    if (!currentVariant || !currentProduct) {
      throw new NotFoundException('Current treatment not found');
    }

    const [idDocumentCount, hasSsn] = await Promise.all([
      this.prisma.document.count({
        where: {
          customerId,
          type: 'ID' as never,
        },
      }),
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { ssn: true },
      }).then((row) => Boolean(row?.ssn)),
    ]);

    if (idDocumentCount === 0 && !hasSsn) {
      throw new BadRequestException(
        'Identity document not uploaded. Please complete the document upload process.',
      );
    }

    const currentPlanRows = await this.prisma.$queryRaw<Array<{ planId: number | null }>>`
      SELECT oi.plan_id AS planId
      FROM order_items oi
      WHERE oi.order_id = ${orderId}
      ORDER BY oi.id ASC
      LIMIT 1
    `;
    const currentPlanId = Number(currentPlanRows[0]?.planId ?? 0) || null;

    const swappableProducts = await this.prisma.swappableProduct.findMany({
      where: { productId: currentProduct.id },
      include: {
        swapableProduct: {
          include: {
            variants: {
              where: {
                deletedAt: null,
                status: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const variantIds = swappableProducts.flatMap((row) =>
      row.swapableProduct.variants.map((variant) => variant.id),
    );
    const plansByVariantId = await this.getVariantPlansMap(variantIds);
    const currentImages = safeParseDbJson<string[]>(
      currentProduct.image ?? '[]',
      [],
    );

    return normalizeBigInts({
      orderId: order.id,
      currentProductId: currentProduct.id,
      currentVariantId: currentVariant.id,
      currentPlanId,
      currentTreatment: {
        productName: currentProduct.name,
        variantName: currentVariant.variantName || currentVariant.title,
        price: Number(currentItem.totalPrice ?? currentVariant.sellingPrice ?? 0),
        image: currentImages[0] ?? currentVariant.image ?? null,
      },
      swappableProducts: swappableProducts.map((row) => ({
        id: row.swapableProduct.id,
        name: row.swapableProduct.name,
        variants: row.swapableProduct.variants.map((variant) => ({
          id: variant.id,
          variantName: variant.variantName,
          subscriptionPlans: plansByVariantId.get(variant.id) ?? [],
        })),
      })),
    });
  }

  async getSwapQuestionnaire(customerId: number, productId: number) {
    await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: true },
      include: {
        changeMedicineQuestion: true,
      },
    });

    if (!product?.changeMedicineQuestion) {
      throw new NotFoundException('Swap questionnaire not found');
    }

    return normalizeBigInts({
      id: product.changeMedicineQuestion.id,
      questions: safeParseDbJson(product.changeMedicineQuestion.questions, []),
    });
  }

  async getSwapCheckoutDetails(
    customerId: number,
    orderId: number,
    productVariantId: number,
    planId: number,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        customer: {
          include: {
            addresses: {
              orderBy: { id: 'desc' },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const planVariantPrice = await this.prisma.planVariantPrice.findFirst({
      where: {
        productVariantId,
        planId,
      },
      include: {
        productVariant: {
          include: {
            product: true,
          },
        },
        subscriptionPlan: true,
        crmShipping: true,
      },
    });

    if (!planVariantPrice?.productVariant?.product) {
      throw new NotFoundException('Swap product plan not found');
    }

    const card = await this.getMaskedCard(order.crmId, order.orderApiId);
    const selectedImages = safeParseDbJson<string[]>(
      planVariantPrice.productVariant.product.image ?? '[]',
      [],
    );

    return normalizeBigInts({
      order: {
        id: order.id,
        shipAddress1: order.shipAddress1,
        shipAddress2: order.shipAddress2,
        shipCity: order.shipCity,
        shipState: order.shipState,
        shipZipcode: order.shipZipcode,
      },
      customer: {
        id: order.customer?.id,
        firstName: order.customer?.firstName,
        lastName: order.customer?.lastName,
        email: order.customer?.email,
        phone: order.customer?.phone,
      },
      selectedVariant: {
        id: planVariantPrice.productVariant.id,
        productId: planVariantPrice.productVariant.product.id,
        productName: planVariantPrice.productVariant.product.name,
        variantName:
          planVariantPrice.productVariant.variantName ||
          planVariantPrice.productVariant.title,
        image:
          selectedImages[0] ??
          planVariantPrice.productVariant.image ??
          null,
        sellingPrice: Number(planVariantPrice.originalPrice ?? 0),
        shippingPrice: Number(planVariantPrice.crmShipping?.shippingPrice ?? 0),
        planId: Number(planVariantPrice.planId),
        planName: planVariantPrice.subscriptionPlan.name,
      },
      card,
    });
  }

  private async getVariantPlansMap(variantIds: number[]) {
    const plansByVariantId = new Map<
      number,
      Array<{ id: number; name: string }>
    >();

    if (!variantIds.length) {
      return plansByVariantId;
    }

    const rows = await this.prisma.planVariantPrice.findMany({
      where: {
        productVariantId: { in: variantIds },
        status: true,
      },
      select: {
        productVariantId: true,
        planId: true,
        subscriptionPlan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ productVariantId: 'asc' }, { planId: 'asc' }],
    });

    for (const row of rows) {
      const current = plansByVariantId.get(row.productVariantId) ?? [];
      current.push({
        id: Number(row.planId),
        name: row.subscriptionPlan.name,
      });
      plansByVariantId.set(row.productVariantId, current);
    }

    return plansByVariantId;
  }

  private async getMaskedCard(crmId?: number | null, orderApiId?: string | null) {
    if (!crmId || !orderApiId) {
      return null;
    }

    try {
      const response = (await this.crmService.getOrderDetails(
        crmId,
        orderApiId,
      )) as Record<string, unknown>;

      const sources = [
        response?.data,
        response,
      ];

      for (const source of sources) {
        if (!source || typeof source !== 'object') {
          continue;
        }

        const customerCard =
          (source as Record<string, unknown>).customer_card ??
          (source as Record<string, unknown>).customerCard;

        const cardRecord = Array.isArray(customerCard)
          ? customerCard[0]
          : customerCard && typeof customerCard === 'object'
            ? customerCard
            : null;

        if (!cardRecord || typeof cardRecord !== 'object') {
          continue;
        }

        const rawNumber = String(
          (cardRecord as Record<string, unknown>).card_number ??
            (cardRecord as Record<string, unknown>).cardNumber ??
            '',
        ).replace(/\D+/g, '');

        if (!rawNumber) {
          continue;
        }

        return {
          cardNumber: `${'*'.repeat(Math.max(rawNumber.length - 4, 0))}${rawNumber.slice(-4)}`,
          cardTypeName: String(
            (cardRecord as Record<string, unknown>).card_type_name ??
              (cardRecord as Record<string, unknown>).cardTypeName ??
              '',
          ).trim() || null,
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}
