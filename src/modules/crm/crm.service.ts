import { Injectable, NotFoundException } from '@nestjs/common';
import { normalizeBigInts } from '../../common/utils/bigint.util';
import { PrismaService } from '../../prisma/prisma.service';
import { safeParseDbJson } from '../../common/utils/json-db.util';
import { CrmProvider } from './interfaces/crm-provider.interface';
import { VrioProvider } from './providers/vrio.provider';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vrioProvider: VrioProvider,
  ) {}

  private resolveProvider(type: string): CrmProvider {
    switch (type) {
      case 'vrio':
        return this.vrioProvider;
      default:
        throw new NotFoundException(`Unsupported CRM type: ${type}`);
    }
  }

  async createPartialOrder(
    crmId: number,
    data: Record<string, unknown>,
    mapping: Record<string, unknown>,
  ) {
    const crm = await this.prisma.crm.findUnique({ where: { id: crmId } });

    if (!crm) {
      throw new NotFoundException('CRM not found');
    }

    const provider = this.resolveProvider(crm.type);
    return provider.createPartialOrder(data, {
      ...mapping,
      credentials: safeParseDbJson<Record<string, unknown>>(crm.credentials, {}),
    });
  }

  async createOrder(
    crmId: number,
    data: Record<string, unknown>,
    mapping: Record<string, unknown>,
  ) {
    const crm = await this.prisma.crm.findUnique({ where: { id: crmId } });

    if (!crm) {
      throw new NotFoundException('CRM not found');
    }

    const provider = this.resolveProvider(crm.type);
    return provider.createOrder(data, {
      ...mapping,
      credentials: safeParseDbJson<Record<string, unknown>>(crm.credentials, {}),
    });
  }

  async captureOrder(crmId: number, orderId: string) {
    const crm = await this.prisma.crm.findUnique({ where: { id: crmId } });

    if (!crm) {
      throw new NotFoundException('CRM not found');
    }

    const provider = this.resolveProvider(crm.type);
    return provider.captureOrder(orderId, {
      credentials: safeParseDbJson<Record<string, unknown>>(crm.credentials, {}),
    });
  }

  async syncCrm(crmId: number) {
    const crm = await this.prisma.crm.findUnique({
      where: { id: crmId },
    });

    if (!crm || !crm.credentials) {
      throw new NotFoundException('CRM not found');
    }

    const provider = this.resolveProvider(crm.type);
    const response = (await provider.getCrmData(
      safeParseDbJson<Record<string, unknown>>(crm.credentials, {}),
    )) as
      | {
          success?: boolean;
          message?: string;
          data?: {
            campaigns?: Array<{
              campaign_id: string;
              campaign_name: string;
              offers?: Array<{
                offer_id: string;
                offer_name: string;
                offer_price?: number | string;
              }>;
              shipping_profiles?: Array<{
                shipping_profile_id: number;
                shipping_profile_name: string;
                shipping_price?: number;
              }>;
            }>;
            coupons?: Array<{
              discount_id: string;
              discount_code: string;
              offer_id: string;
            }>;
          };
        }
      | undefined;

    if (!response?.success || !response.data?.campaigns?.length) {
      return {
        success: false,
        message: response?.message ?? 'CRM sync failed',
        data: [],
      };
    }

    await this.prisma.$transaction(async (tx: any) => {
      for (const campaign of response.data!.campaigns!) {
        const existingCampaign = await tx.crmCampaign.findFirst({
          where: {
            crmId,
            campaignId: campaign.campaign_id,
          },
          select: { id: true },
        });

        const savedCampaign = existingCampaign
          ? await tx.crmCampaign.update({
              where: { id: existingCampaign.id },
              data: { name: campaign.campaign_name, status: true },
            })
          : await tx.crmCampaign.create({
              data: {
                crmId,
                campaignId: campaign.campaign_id,
                name: campaign.campaign_name,
                status: true,
              },
            });

        const syncedOfferIds = new Set(
          (campaign.offers ?? []).map((offer) => String(offer.offer_id)),
        );

        for (const offer of campaign.offers ?? []) {
          const existingOffer = await tx.crmOffer.findFirst({
            where: {
              crmId,
              crmCampaignId: savedCampaign.id,
              offerId: offer.offer_id,
            },
            select: { id: true },
          });

          if (existingOffer) {
            await tx.crmOffer.update({
              where: { id: existingOffer.id },
              data: { name: offer.offer_name, status: true },
            });
          } else {
            await tx.crmOffer.create({
              data: {
                crmId,
                crmCampaignId: savedCampaign.id,
                offerId: offer.offer_id,
                name: offer.offer_name,
                status: true,
              },
            });
          }
        }

        await tx.crmOffer.updateMany({
          where: {
            crmId,
            crmCampaignId: savedCampaign.id,
            ...(syncedOfferIds.size
              ? { offerId: { notIn: Array.from(syncedOfferIds) } }
              : {}),
            productVariants: { none: {} },
          },
          data: { status: false },
        });

        const syncedShippingProfileIds = new Set(
          (campaign.shipping_profiles ?? []).map((shipping) => Number(shipping.shipping_profile_id)),
        );

        for (const shipping of campaign.shipping_profiles ?? []) {
          const existingShipping = await tx.crmShipping.findFirst({
            where: {
              crmId,
              crmCampaignId: savedCampaign.id,
              shippingProfileId: shipping.shipping_profile_id,
            },
            select: { id: true },
          });

          if (existingShipping) {
            await tx.crmShipping.update({
              where: { id: existingShipping.id },
              data: {
                shippingProfile: shipping.shipping_profile_name,
                shippingPrice: shipping.shipping_price ?? 0,
              },
            });
          } else {
            await tx.crmShipping.create({
              data: {
                crmId,
                crmCampaignId: savedCampaign.id,
                shippingProfileId: shipping.shipping_profile_id,
                shippingProfile: shipping.shipping_profile_name,
                shippingPrice: shipping.shipping_price ?? 0,
              },
            });
          }
        }

        await tx.crmShipping.deleteMany({
          where: {
            crmId,
            crmCampaignId: savedCampaign.id,
            ...(syncedShippingProfileIds.size
              ? {
                  shippingProfileId: {
                    notIn: Array.from(syncedShippingProfileIds),
                  },
                }
              : {}),
            productVariants: { none: {} },
          },
        });
      }

      const coupons = response.data?.coupons ?? [];
      for (const coupon of coupons) {
        const offer = await tx.crmOffer.findFirst({
          where: {
            crmId,
            offerId: String(coupon.offer_id),
          },
          select: { id: true },
        });

        if (!offer) {
          continue;
        }

        const existingCoupon = await tx.crmCoupon.findFirst({
          where: {
            discountId: String(coupon.discount_id),
            crmOfferId: offer.id,
          },
          select: { id: true },
        });

        if (existingCoupon?.id) {
          await tx.crmCoupon.updateMany({
            where: { id: existingCoupon.id },
            data: {
              discountId: String(coupon.discount_id),
              discountCode: String(coupon.discount_code),
              updatedAt: new Date(),
            },
          });
        } else {
          const now = new Date();
          await tx.crmCoupon.createMany({
            data: [{
              discountId: String(coupon.discount_id),
              discountCode: String(coupon.discount_code),
              crmOfferId: offer.id,
              createdAt: now,
              updatedAt: now,
            }],
          });
        }
      }
    });

    return { success: true, message: 'Data synced successfully', data: [] };
  }

  async getCampaigns(crmId: number) {
    const crm = await this.prisma.crm.findUnique({
      where: { id: crmId },
      select: { id: true },
    });

    if (!crm) {
      throw new NotFoundException('CRM not found');
    }

    const campaigns = await this.prisma.crmCampaign.findMany({
      where: { crmId, status: true },
      select: { id: true, crmId: true, campaignId: true, name: true },
      orderBy: { id: 'asc' },
    });

    return normalizeBigInts(campaigns);
  }

  async getCampaignDetails(campaignId: number) {
    const campaign = await this.prisma.crmCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, crmId: true, campaignId: true, name: true, status: true },
    });

    if (!campaign || !campaign.status) {
      throw new NotFoundException('CRM campaign not found');
    }

    const [offers, shippingProfiles] = await Promise.all([
      this.prisma.crmOffer.findMany({
        where: { crmCampaignId: campaignId, status: true },
        select: { id: true, crmId: true, crmCampaignId: true, offerId: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.crmShipping.findMany({
        where: { crmCampaignId: campaignId },
        select: {
          id: true,
          crmId: true,
          crmCampaignId: true,
          shippingProfileId: true,
          shippingProfile: true,
          shippingPrice: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    return normalizeBigInts({
      campaign,
      offers,
      shippingProfiles,
    });
  }

  async getDetails(crmId: number) {
    const crm = await this.prisma.crm.findUnique({
      where: { id: crmId },
      select: { id: true },
    });

    if (!crm) {
      throw new NotFoundException('CRM not found');
    }

    const [campaigns, offers, shippingProfiles] = await Promise.all([
      this.prisma.crmCampaign.findMany({
        where: { crmId, status: true },
        select: { id: true, crmId: true, campaignId: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.crmOffer.findMany({
        where: { crmId, status: true },
        select: { id: true, crmId: true, crmCampaignId: true, offerId: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.crmShipping.findMany({
        where: { crmId },
        select: {
          id: true,
          crmId: true,
          crmCampaignId: true,
          shippingProfileId: true,
          shippingProfile: true,
          shippingPrice: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    return normalizeBigInts({
      campaigns,
      offers,
      shippingProfiles,
    });
  }
}
