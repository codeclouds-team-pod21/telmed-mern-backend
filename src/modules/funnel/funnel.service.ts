import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseDbJsonArray } from '../../common/utils/json-db.util';
import { slugify } from '../../common/utils/slug.util';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FunnelService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly publicFunnelWhere = {
    status: true,
    displayDefault: false,
    deletedAt: null,
  } as const;

  async listAdminFunnels(searchText?: string, status?: boolean) {
    const rows = await this.prisma.funnel.findMany({
      where: {
        deletedAt: null,
        ...(typeof status === 'boolean' ? { status } : {}),
        ...(searchText
          ? {
              OR: [
                { funnelName: { contains: searchText } },
                { slug: { contains: searchText } },
                { promoSlug: { contains: searchText } },
              ],
            }
          : {}),
      },
      include: {
        funnelProducts: {
          where: { deletedAt: null },
          include: {
            product: true,
            defaultProductVariant: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    return Promise.all(
      rows.map(async (row) => {
        const orderCount = await this.prisma.order.count({
          where: { funnelId: row.id },
        });

        return {
          ...row,
          canDelete: orderCount === 0,
          deleteBlockedReason:
            orderCount === 0
              ? null
              : 'This funnel is used in an order and cannot be deleted.',
        };
      }),
    );
  }

  async getAdminFunnel(id: number) {
    const funnel = await this.prisma.funnel.findFirst({
      where: { id, deletedAt: null },
      include: {
        funnelProducts: {
          where: { deletedAt: null },
          include: {
            product: true,
            defaultProductVariant: true,
          },
        },
      },
    });

    if (!funnel) {
      throw new NotFoundException(`Funnel ${id} not found`);
    }

    return funnel;
  }

  async getActiveFunnels() {
    return this.prisma.funnel.findMany({
      where: this.publicFunnelWhere,
      include: {
        funnelProducts: {
          where: {
            status: true,
            deletedAt: null,
            product: {
              status: true,
              deletedAt: null,
            },
          },
          include: { product: true },
        },
      },
    });
  }

  async getCreateOptions() {
    const [crms, campaigns, allFunnels] = await Promise.all([
      this.prisma.crm.findMany({
        where: { status: true },
        select: { id: true, name: true, type: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.crmCampaign.findMany({
        where: { status: true },
        select: { id: true, crmId: true, campaignId: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.funnel.findMany({
        where: { status: true, deletedAt: null },
        select: { id: true, funnelName: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    return {
      crms,
      campaigns,
      displayOptions: [
        { value: 0, label: 'Public' },
        { value: 1, label: 'Unlisted' },
      ],
      redirectTypes: [
        { value: 'soft', label: 'Soft' },
        { value: 'hard', label: 'Hard' },
      ],
      allFunnels,
      funnelTemplates: this.getFunnelTemplates(),
    };
  }

  async getFunnelBySlugOrPromoSlug(slug: string, promoSlug: string) {
    const funnel = await this.prisma.funnel.findFirst({
      where: {
        ...this.publicFunnelWhere,
        slug,
        promoSlug,
      },
      include: {
        funnelProducts: {
          where: {
            deletedAt: null,
            status: true,
            product: {
              status: true,
              deletedAt: null,
            },
          },
          include: {
            product: true,
            defaultProductVariant: {
              include: {
                crmOffer: {
                  select: {
                    id: true,
                    crmId: true,
                    offerId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!funnel) {
      throw new NotFoundException('Funnel not found');
    }

    return funnel;
  }

  async create(dto: CreateFunnelDto, userId?: number) {
    await this.validateFunnelProducts(dto.crm, dto.campaign, dto.funnelProducts);

    return this.prisma.$transaction(async (tx: any) => {
      const funnel = await tx.funnel.create({
        data: {
          funnelName: dto.funnelName,
          slug: slugify(dto.slug),
          promoSlug: dto.promoSlug,
          description: dto.funnelDescription,
          shortDescription: dto.shortDescription,
          crmCampaignId: dto.campaign,
          renewalCampaignId: dto.renewalCampaign,
          swappableCampaignId: dto.swappableCampaign,
          displayDefault: dto.displayDefault === 1,
          redirectType: dto.redirectType === 'hard' ? 'hard' : 'soft',
          redirectFunnelId: dto.funnelRedirection,
          template: dto.funnelTemplate,
          image: dto.funnelImage,
          createdBy: userId,
        },
      });

      await tx.funnelProduct.createMany({
        data: dto.funnelProducts.map((item) => ({
          funnelId: funnel.id,
          productId: item.productId,
          crmCampaignId: dto.campaign,
          defaultProductVariantId: item.productVariantId,
          status: true,
          createdBy: userId,
        })),
      });

      return tx.funnel.findUniqueOrThrow({
        where: { id: funnel.id },
        include: { funnelProducts: true },
      });
    });
  }

  async update(id: number, dto: UpdateFunnelDto, userId?: number) {
    const funnel = await this.prisma.funnel.findUnique({
      where: { id },
      include: { funnelProducts: true },
    });

    if (!funnel) {
      throw new NotFoundException(`Funnel ${id} not found`);
    }

    if (dto.funnelProducts?.length && dto.crm && dto.campaign) {
      await this.validateFunnelProducts(dto.crm, dto.campaign, dto.funnelProducts);
    }

    return this.prisma.$transaction(async (tx: any) => {
      await tx.funnel.update({
        where: { id },
        data: {
          funnelName: dto.funnelName ?? funnel.funnelName,
          slug: dto.slug ? slugify(dto.slug) : funnel.slug,
          promoSlug: dto.promoSlug ?? funnel.promoSlug,
          description: dto.funnelDescription ?? funnel.description,
          shortDescription: dto.shortDescription ?? funnel.shortDescription,
          crmCampaignId: dto.campaign ?? funnel.crmCampaignId,
          renewalCampaignId: dto.renewalCampaign ?? funnel.renewalCampaignId,
          swappableCampaignId: dto.swappableCampaign ?? funnel.swappableCampaignId,
          displayDefault:
            dto.displayDefault !== undefined
              ? dto.displayDefault === 1
              : funnel.displayDefault,
          redirectType:
            dto.redirectType === 'hard' || dto.redirectType === 'soft'
              ? dto.redirectType
              : funnel.redirectType,
          redirectFunnelId: dto.funnelRedirection ?? funnel.redirectFunnelId,
          template: dto.funnelTemplate ?? funnel.template,
          image: dto.funnelImage ?? funnel.image,
          updatedBy: userId,
        },
      });

      if (dto.funnelProducts) {
        const existingIds = new Set(
          dto.funnelProducts.map((item: { id?: number }) => item.id).filter(Boolean),
        );
        const toDelete = funnel.funnelProducts
          .filter((item: { id: number }) => !existingIds.has(item.id))
          .map((item: { id: number }) => item.id);

        if (toDelete.length) {
          await tx.funnelProduct.updateMany({
            where: { id: { in: toDelete } },
            data: { deletedBy: userId, deletedAt: new Date() },
          });
        }

        for (const item of dto.funnelProducts) {
          if (item.id) {
            await tx.funnelProduct.update({
              where: { id: item.id },
              data: {
                productId: item.productId,
                defaultProductVariantId: item.productVariantId,
                crmCampaignId: dto.campaign ?? funnel.crmCampaignId,
                updatedBy: userId,
              },
            });
          } else {
            await tx.funnelProduct.create({
              data: {
                funnelId: id,
                productId: item.productId,
                defaultProductVariantId: item.productVariantId,
                crmCampaignId: dto.campaign ?? funnel.crmCampaignId,
                status: true,
                createdBy: userId,
              },
            });
          }
        }
      }

      return tx.funnel.findUniqueOrThrow({
        where: { id },
        include: { funnelProducts: true },
      });
    });
  }

  async checkSlug(slug: string) {
    const formattedSlug = slugify(slug);
    const exists = await this.prisma.funnel.count({
      where: { slug: formattedSlug, deletedAt: null },
    });
    return { slug: formattedSlug, exists: exists > 0 };
  }

  async remove(id: number, userId?: number) {
    const funnel = await this.prisma.funnel.findFirst({
      where: { id, deletedAt: null },
      include: {
        orders: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!funnel) {
      throw new NotFoundException(`Funnel ${id} not found`);
    }

    if (funnel.orders.length) {
      throw new BadRequestException(
        'This funnel is used in an order and cannot be deleted.',
      );
    }

    return this.prisma.$transaction(async (tx: any) => {
      await tx.funnelProduct.updateMany({
        where: { funnelId: id, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: userId },
      });

      await tx.funnel.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: userId },
      });

      return { success: true };
    });
  }

  async getVariants(productId: number) {
    return this.prisma.productVariant.findMany({
      where: { productId, status: true, deletedAt: null },
      select: { id: true, variantName: true },
    });
  }

  async getStates() {
    const rows = await this.prisma.addressLocation.findMany({
      where: {
        countryCode: 'US',
        state: {
          not: null,
        },
        stateAbbr: {
          not: null,
        },
      },
      select: {
        state: true,
        stateAbbr: true,
      },
      distinct: ['stateAbbr'],
      orderBy: { state: 'asc' },
    });

    return rows
      .filter((row) => row.state?.trim() && row.stateAbbr?.trim())
      .map((row) => ({
        value: String(row.stateAbbr),
        label: String(row.state),
      }));
  }

  async getProductsByCrm(crmId: number, campaignId?: number) {
    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: true,
        productClassification: 'main',
        variants: {
          some: {
            crmOffer: {
              crmId,
            },
            ...(campaignId ? { crmCampaignId: campaignId } : {}),
          },
        },
      },
      select: { id: true, name: true, productType: true },
    });
  }

  async validateState(productId: number, state: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const restricted = parseDbJsonArray(product.restrictedState);

    if (restricted.includes(state)) {
      const alternatives = await this.prisma.product.findMany({
        where: {
          id: { not: product.id },
        },
      });

      return {
        allowed: false,
        message: 'Service not available in selected state.',
        alternatives,
      };
    }

    return { allowed: true, message: 'State is valid.' };
  }

  private async validateFunnelProducts(
    _crmId: number,
    campaignId: number,
    items: CreateFunnelDto['funnelProducts'],
  ) {
    const combinations = new Set<string>();
    for (const item of items) {
      const key = `${item.productId}-${item.productVariantId}`;
      if (combinations.has(key)) {
        throw new BadRequestException(
          "Product and product variant can't be same.",
        );
      }
      combinations.add(key);

      const variant = await this.prisma.productVariant.findUnique({
        where: { id: item.productVariantId },
        select: { id: true, productId: true, crmCampaignId: true },
      });
      if (!variant || variant.productId !== item.productId) {
        throw new BadRequestException(
          'The selected variant does not belong to the selected product.',
        );
      }

      if (variant.crmCampaignId !== campaignId) {
        throw new BadRequestException(
          'The selected variant belongs to a different campaign than the funnel main campaign.',
        );
      }
    }
  }

  private getFunnelTemplates() {
    const candidatePaths = [
      path.resolve(process.cwd(), '..', 'telemed-frontend', 'src', 'funnel-templates'),
      path.resolve(process.cwd(), '..', 'telmed-internal', 'resources', 'views', 'pages', 'funnel'),
      path.resolve(process.cwd(), '..', 'resources', 'views', 'pages', 'funnel'),
      path.resolve(process.cwd(), 'resources', 'views', 'pages', 'funnel'),
    ];

    const directPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!directPath) {
      return ['default'];
    }

    const templates = new Set<string>();
    const folders = fs
      .readdirSync(directPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

    for (const folder of folders) {
      const childPath = path.join(directPath, folder.name);
      const templateFile = path.join(childPath, 'template.json');

      if (folder.name === 'default' || fs.existsSync(templateFile)) {
        templates.add(folder.name);
        continue;
      }

      const subFolders = fs
        .readdirSync(childPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());

      for (const subFolder of subFolders) {
        templates.add(`${folder.name}.${subFolder.name}`);
      }
    }

    return templates.size ? Array.from(templates).sort() : ['default'];
  }
}
