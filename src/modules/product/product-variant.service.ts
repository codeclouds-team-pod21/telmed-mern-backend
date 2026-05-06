import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductVariantDto } from './dto/product-variant.dto';
import { ProductGender } from './product.enums';

@Injectable()
export class ProductVariantService {
  private toGender(gender: string): ProductGender {
    if (gender === 'male' || gender === 'female' || gender === 'both') {
      return gender as ProductGender;
    }
    return ProductGender.both;
  }

  async deleteVariants(
    tx: Prisma.TransactionClient,
    variantIds: number[],
  ): Promise<void> {
    if (!variantIds.length) {
      return;
    }
    await tx.productRelatedItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await tx.productVariant.updateMany({
      where: { id: { in: variantIds } },
      data: { deletedAt: new Date() },
    });
  }

  async upsertVariants(
    tx: Prisma.TransactionClient,
    input: {
      productId: number;
      productName: string;
      genderAvailability: string;
      variants: ProductVariantDto[];
    },
  ) {
    for (const [variantIndex, variant] of input.variants.entries()) {
      await this.validateVariantReferences(tx, variant);

      const data = {
        title: `${input.productName}-${variant.basic.variantName}`,
        variantName: variant.basic.variantName,
        productId: input.productId,
        description: variant.basic.description,
        image: variant.basic.image,
        gender: this.toGender(input.genderAvailability),
        sellingPrice: 0,
        crmItem: variant.crm.plans?.length ? variant.crm.plans.map((plan) => plan.planId).join(',') : null,
        crmOfferId: variant.crm.offer,
        shippingProfileId: variant.crm.shippingProfile,
        pharmacy: String(variant.crm.pharmacy),
        crmCampaignId: variant.crm.campaign,
        doctorNetworkId: variant.doctor.networkId,
        docNetworkOfferingId: variant.doctor.offrableId,
        refills: variant.doctor.refills,
        doctorQuantity: variant.doctor.quantity,
        daysSupplies: variant.doctor.daysSupply,
        dispenseUnits: variant.doctor.dispenseUnit,
        doctorPrescriptionDuration: variant.doctor.prescriptionDuration,
        isSupplyAvailable: Boolean(variant.isSupplyAvailable),
        isTitrationAvailable: Boolean(variant.isTitrationAvailable),
        isPopular: Boolean(variant.isPopular),
        status: variant.status ?? true,
        variantOrder: variantIndex + 1,
      };

      const saved = variant.basic.id
        ? await tx.productVariant.update({
            where: { id: variant.basic.id },
            data,
          })
        : await tx.productVariant.create({ data });

      await this.syncVariantPlans(tx, {
        productId: input.productId,
        variantId: saved.id,
        plans: variant.crm.plans ?? [],
      });

      await tx.productRelatedItem.deleteMany({ where: { variantId: saved.id } });

      if (variant.isSupplyAvailable && !(variant.supplyProducts?.length)) {
        throw new BadRequestException('Supply products are required when supply is enabled.');
      }

      if (variant.isTitrationAvailable && !(variant.titrationProducts?.length)) {
        throw new BadRequestException('Titration products are required when titration is enabled.');
      }

      if (variant.supplyProducts?.length) {
        await tx.productRelatedItem.createMany({
          data: variant.supplyProducts.map((additionalProductId) => ({
            productId: input.productId,
            variantId: saved.id,
            additionalProductId,
            type: 'supply',
          })),
          skipDuplicates: true,
        });
      }

      if (variant.titrationProducts?.length) {
        await tx.productRelatedItem.createMany({
          data: variant.titrationProducts.map((additionalProductId) => ({
            productId: input.productId,
            variantId: saved.id,
            additionalProductId,
            type: 'titration',
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  private async validateVariantReferences(
    tx: Prisma.TransactionClient,
    variant: ProductVariantDto,
  ) {
    const [crmOffer, shippingProfile, crmCampaign, doctorNetwork] = await Promise.all([
      tx.crmOffer.findUnique({
        where: { id: variant.crm.offer },
        select: { id: true, crmCampaignId: true },
      }),
      tx.crmShipping.findUnique({
        where: { id: variant.crm.shippingProfile },
        select: { id: true, crmCampaignId: true },
      }),
      tx.crmCampaign.findUnique({
        where: { id: variant.crm.campaign },
        select: { id: true },
      }),
      tx.doctorNetwork.findUnique({
        where: { id: variant.doctor.networkId },
        select: { id: true },
      }),
    ]);

    if (variant.crm.plans?.length) {
      const planIds = variant.crm.plans.map((plan) => plan.planId);
      const uniquePlanIds = Array.from(new Set(planIds));
      const planRows = await tx.subscriptionPlan.findMany({
        where: {
          id: { in: uniquePlanIds },
        },
        select: { id: true },
      });
      const foundPlanIds = new Set(planRows.map((row) => Number(row.id)));

      for (const plan of variant.crm.plans) {
        if (!foundPlanIds.has(plan.planId)) {
          throw new BadRequestException(
            `Subscription plan ${plan.planId} does not exist.`,
          );
        }

        const [planCampaign, planOffer, planShipping] = await Promise.all([
          tx.crmCampaign.findUnique({
            where: { id: plan.campaign },
            select: { id: true },
          }),
          tx.crmOffer.findUnique({
            where: { id: plan.offer },
            select: { id: true },
          }),
          tx.crmShipping.findUnique({
            where: { id: plan.shippingProfile },
            select: { id: true },
          }),
        ]);

        if (!planCampaign) {
          throw new BadRequestException(
            `Plan CRM campaign ${plan.campaign} does not exist.`,
          );
        }

        if (!planOffer) {
          throw new BadRequestException(
            `Plan CRM offer ${plan.offer} does not exist.`,
          );
        }

        if (!planShipping) {
          throw new BadRequestException(
            `Plan shipping profile ${plan.shippingProfile} does not exist.`,
          );
        }
      }
    }

    if (!crmOffer) {
      throw new BadRequestException(
        `CRM offer ${variant.crm.offer} does not exist.`,
      );
    }

    if (!shippingProfile) {
      throw new BadRequestException(
        `CRM shipping profile ${variant.crm.shippingProfile} does not exist.`,
      );
    }

    if (!crmCampaign) {
      throw new BadRequestException(
        `CRM campaign ${variant.crm.campaign} does not exist.`,
      );
    }

    if (!doctorNetwork) {
      throw new BadRequestException(
        `Doctor network ${variant.doctor.networkId} does not exist.`,
      );
    }

    // The admin flow only checks that the selected CRM rows exist.
    // Legacy products can carry CRM references that no longer align perfectly
    // by campaign, so edit mode must not block saving those records.
  }

  private async syncVariantPlans(
    tx: Prisma.TransactionClient,
    input: {
      productId: number;
      variantId: number;
      plans: Array<{
        planId: number;
        campaign: number;
        offer: number;
        shippingProfile: number;
        sellingPrice: number;
        discountAmount?: number;
        discountCoupon?: string;
        durationWeeks?: number;
        supplyWeeks?: number;
        isDefault?: boolean;
        status?: boolean;
      }>;
    },
  ) {
    await tx.planVariantPrice.deleteMany({
      where: { productVariantId: input.variantId },
    });

    if (!input.plans.length) {
      return;
    }

    await tx.planVariantPrice.createMany({
      data: input.plans.map((plan) => ({
        planId: plan.planId,
        productId: input.productId,
        productVariantId: input.variantId,
        crmCampaignId: plan.campaign,
        shippingProfile: plan.shippingProfile,
        crmOfferId: plan.offer,
        durationWeeks: Number(plan.durationWeeks ?? 0),
        supplyWeeks: Number(plan.supplyWeeks ?? 0),
        originalPrice: Number(plan.sellingPrice ?? 0),
        discountAmount: Number(plan.discountAmount ?? 0),
        discountCoupon: plan.discountCoupon ?? null,
        isDefault: Boolean(plan.isDefault),
        status: plan.status !== false,
      })),
    });
  }
}
