import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slug.util';
import {
  parseDbJsonArray,
  safeParseDbJson,
  stringifyDbJson,
} from '../../common/utils/json-db.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductClassification } from './product.enums';
import { ProductVariantService } from './product-variant.service';
import { ManageProductDatasetDto } from './dto/manage-product-dataset.dto';

type ProductRecord = {
  image: string | null;
  restrictedState: string | null;
  keypoints: string | null;
  [key: string]: unknown;
};

type DatasetOption = {
  id: number | bigint;
  name: string;
  label: string;
};

type SubscriptionPlanOption = {
  id: number | bigint;
  name: string;
};

type CrmCampaignOption = {
  id: number;
  crmId: number;
  campaignId: string | null;
  name: string;
};

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productVariantService: ProductVariantService,
  ) {}

  async findAll(searchText?: string, status?: boolean) {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(typeof status === 'boolean' ? { status } : {}),
        ...(searchText
          ? {
              OR: [
                { name: { contains: searchText } },
                { productCategory: { contains: searchText } },
                { productType: { contains: searchText } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
    });

    return products.map((product: ProductRecord) => this.serializeProduct(product));
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        variants: {
          where: { deletedAt: null },
          include: {
            crmOffer: {
              select: {
                id: true,
                crmId: true,
                crmCampaignId: true,
              },
            },
            crmCampaign: {
              select: {
                id: true,
                crmId: true,
              },
            },
            shippingProfile: {
              select: {
                id: true,
                crmId: true,
                crmCampaignId: true,
              },
            },
          },
        },
        swappableProducts: true,
        relatedItems: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    const variantPlans = await this.getVariantPlans(
      product.variants.map((variant) => variant.id),
    );

    return this.serializeProduct({
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        subscriptionPlans: variantPlans.get(variant.id) ?? [],
      })),
    });
  }

  async create(dto: CreateProductDto, userId?: number) {
    await this.validateVariantBusinessRules(
      dto.productVariants,
      dto.swappableProductIds,
      dto.swappableProductQuestionaries,
    );
    await this.validateOfferableIds(dto.productVariants);
    await this.validateCreateReferences(dto);

    const slug = await this.buildUniqueSlug(dto.name);
    const productClassification = dto.productClassification ?? ProductClassification.main;
    const metaData = dto.productVariants[0]?.doctor.metaData ?? null;

    return this.prisma.$transaction(async (tx: any) => {
      const product = await tx.product.create({
        data: {
          name: dto.name,
          description: dto.description,
          productCategory: dto.productCategory,
          productType: dto.productType,
          productClassification,
          productGroupName: dto.productType,
          productSlugName: slug,
          metaData,
          image: stringifyDbJson(dto.productImage ? [dto.productImage] : []),
          restrictedState: stringifyDbJson(dto.restrictedState ?? []),
          blockMilitaryBases: Boolean(dto.blockMilitaryBases),
          blockIslands: Boolean(dto.blockIslands),
          displayPrice: dto.displayPrice,
          genericQuestionId: dto.generalQuestion,
          medicalQuestionId: dto.medicalQuestion,
          changeMedicineQuestionId: dto.swappableProductQuestionaries,
          status: dto.status,
          keypoints: stringifyDbJson(dto.keypoints ?? []),
          createdBy: userId,
        },
      });

      if (dto.swappableProductIds?.length) {
        await tx.swappableProduct.createMany({
          data: dto.swappableProductIds.map((swapableProductId) => ({
            productId: product.id,
            swapableProductId,
          })),
          skipDuplicates: true,
        });
      }

      await this.productVariantService.upsertVariants(tx, {
        productId: product.id,
        productName: product.name,
        genderAvailability: dto.genderAvailability,
        variants: dto.productVariants,
      });

      const savedProduct = await tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { variants: true, swappableProducts: true, relatedItems: true },
      });

      const variantPlans = await this.getVariantPlans(
        savedProduct.variants.map((variant: { id: number }) => variant.id),
        tx,
      );

      return this.serializeProduct({
        ...savedProduct,
        variants: savedProduct.variants.map((variant: { id: number }) => ({
          ...variant,
          subscriptionPlans: variantPlans.get(variant.id) ?? [],
        })),
      });
    });
  }

  async update(id: number, dto: UpdateProductDto, userId?: number) {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    if (dto.productVariants?.length) {
      await this.validateVariantBusinessRules(
        dto.productVariants,
        dto.swappableProductIds,
        dto.swappableProductQuestionaries,
      );
      await this.validateOfferableIds(dto.productVariants);
    }
    await this.validateUpdateReferences(dto, id);
    const resolvedSlug =
      dto.name !== undefined
        ? await this.resolveProductSlug(dto.name, undefined, id)
        : existing.productSlugName;

    return this.prisma.$transaction(async (tx: any) => {
      if (dto.deleteVariantIds?.length) {
        await this.productVariantService.deleteVariants(tx, dto.deleteVariantIds);
      }

      await tx.product.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          description: dto.description ?? existing.description,
          productCategory: dto.productCategory ?? existing.productCategory,
          productType: dto.productType ?? existing.productType,
          productClassification:
            dto.productClassification ?? existing.productClassification,
          productGroupName:
            dto.productType ??
            existing.productGroupName ??
            existing.productType,
          productSlugName: resolvedSlug,
          metaData: dto.productVariants?.[0]?.doctor.metaData ?? existing.metaData,
          image:
            dto.productImage !== undefined
              ? stringifyDbJson(dto.productImage ? [dto.productImage] : [])
              : existing.image,
          restrictedState:
            dto.restrictedState !== undefined
              ? stringifyDbJson(dto.restrictedState)
              : existing.restrictedState,
          blockMilitaryBases:
            dto.blockMilitaryBases ?? existing.blockMilitaryBases,
          blockIslands: dto.blockIslands ?? existing.blockIslands,
          displayPrice:
            dto.displayPrice !== undefined
              ? dto.displayPrice
              : existing.displayPrice,
          genericQuestionId: dto.generalQuestion ?? existing.genericQuestionId,
          medicalQuestionId: dto.medicalQuestion ?? existing.medicalQuestionId,
          changeMedicineQuestionId:
            dto.swappableProductQuestionaries ?? existing.changeMedicineQuestionId,
          status: dto.status ?? existing.status,
          keypoints:
            dto.keypoints !== undefined
              ? stringifyDbJson(dto.keypoints)
              : existing.keypoints,
          updatedBy: userId,
        },
      });

      if (dto.swappableProductIds) {
        await tx.swappableProduct.deleteMany({ where: { productId: id } });
        if (dto.swappableProductIds.length) {
          await tx.swappableProduct.createMany({
            data: dto.swappableProductIds.map((swapableProductId) => ({
              productId: id,
              swapableProductId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (dto.productVariants?.length) {
        await this.productVariantService.upsertVariants(tx, {
          productId: id,
          productName: dto.name ?? existing.name,
          genderAvailability: dto.genderAvailability ?? 'both',
          variants: dto.productVariants,
        });
      }

      const savedProduct = await tx.product.findUniqueOrThrow({
        where: { id },
        include: { variants: true, swappableProducts: true, relatedItems: true },
      });

      const variantPlans = await this.getVariantPlans(
        savedProduct.variants.map((variant: { id: number }) => variant.id),
        tx,
      );

      return this.serializeProduct({
        ...savedProduct,
        variants: savedProduct.variants.map((variant: { id: number }) => ({
          ...variant,
          subscriptionPlans: variantPlans.get(variant.id) ?? [],
        })),
      });
    });
  }

  async remove(id: number, userId?: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        funnelProducts: true,
        usedAsAdditional: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    if (product.funnelProducts.length) {
      throw new BadRequestException(
        'This product is used in a funnel and cannot be deleted.',
      );
    }

    if (
      ['supply', 'titration'].includes(String(product.productClassification)) &&
      product.usedAsAdditional.length
    ) {
      throw new BadRequestException(
        `This ${product.productClassification} product is assigned to a main product and cannot be deleted.`,
      );
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return { success: true };
  }

  async checkSlug(rawSlug: string) {
    const slug = slugify(rawSlug);
    const exists = await this.prisma.product.count({
      where: { productSlugName: slug, deletedAt: null },
    });

    return { slug, exists: exists > 0 };
  }

  async getCreateOptions() {
    const [productCategories, productTypes, genders] = await Promise.all([
      this.prisma.dataset.findMany({
        where: { type: 'product_category' },
        select: { id: true, name: true, label: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.dataset.findMany({
        where: { type: 'product_type' },
        select: { id: true, name: true, label: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.dataset.findMany({
        where: { type: 'gender' },
        select: { id: true, name: true, label: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const [
      generalQuestions,
      medicalQuestions,
      swappableQuestions,
      crms,
      doctorNetworks,
      countries,
      supplyProducts,
      titrationProducts,
      crmCampaigns,
      keypointSuggestions,
      subscriptionPlans,
    ] = await Promise.all([
      this.prisma.questionnaire.findMany({
        where: { deletedAt: null, status: true, type: 'general' as never },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.questionnaire.findMany({
        where: { deletedAt: null, status: true, type: 'medical' as never },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.questionnaire.findMany({
        where: { deletedAt: null, status: true, type: 'swap' as never },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.crm.findMany({
        where: { status: true },
        select: { id: true, name: true, type: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.doctorNetwork.findMany({
        where: { status: true },
        select: { id: true, name: true, type: true },
        orderBy: { id: 'asc' },
      }),
      this.getCountries(),
      this.prisma.product.findMany({
        where: {
          deletedAt: null,
          status: true,
          productClassification: 'supply' as never,
        },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.product.findMany({
        where: {
          deletedAt: null,
          status: true,
          productClassification: 'titration' as never,
        },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.crmCampaign.findMany({
        select: { id: true, crmId: true, campaignId: true, name: true },
        orderBy: { id: 'asc' },
      }),
      this.getKeypointSuggestions(),
      this.getSubscriptionPlans(),
    ]);

    return this.normalizeBigInts({
      productCategories,
      productTypes,
      genders,
      generalQuestions,
      medicalQuestions,
      swappableQuestions,
      crms,
      doctorNetworks,
      countries,
      supplyProducts,
      titrationProducts,
      crmCampaigns,
      keypointSuggestions,
      subscriptionPlans,
    });
  }

  private async getCountries() {
    const rows = await this.prisma.addressLocation.findMany({
      where: {
        country: { not: null },
        countryCode: { not: null },
      },
      select: {
        country: true,
        countryCode: true,
      },
      distinct: ['countryCode'],
      orderBy: { country: 'asc' },
    });

    return rows
      .filter((row) => row.country?.trim() && row.countryCode?.trim())
      .map((row) => ({
        value: String(row.countryCode).toUpperCase(),
        label: String(row.country),
      }));
  }

  async getKeypointSuggestions() {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        NOT: [{ keypoints: null }, { keypoints: '' }],
      },
      select: { keypoints: true },
      orderBy: { id: 'desc' },
    });

    return Array.from(
      new Set(
        products.flatMap((product) =>
          parseDbJsonArray(product.keypoints)
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }

  async getSwapProductsByType(productType: string, productId?: number) {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: true,
        productType,
        productClassification: ProductClassification.main,
        ...(productId ? { id: { not: productId } } : {}),
      },
      select: { id: true, name: true },
    });

    return products;
  }

  async getManagedDatasets(type: ManageProductDatasetDto['type']) {
    return this.prisma.dataset.findMany({
      where: { type },
      select: { id: true, name: true, label: true, canDelete: true },
      orderBy: { id: 'asc' },
    });
  }

  async createManagedDataset(dto: ManageProductDatasetDto) {
    const label = dto.label.trim();
    if (!label) {
      throw new BadRequestException('Label is required.');
    }

    const exists = await this.prisma.dataset.findFirst({
      where: {
        type: dto.type,
        label: { equals: label },
      },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('Already exists. Choose another name.');
    }

    const name = slugify(label).replace(/-/g, '_');

    await this.prisma.dataset.create({
      data: {
        name,
        label,
        type: dto.type,
        canDelete: true,
      },
    });

    return this.getManagedDatasets(dto.type);
  }

  async deleteManagedDataset(id: number, type: ManageProductDatasetDto['type']) {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id, type },
      select: { id: true, canDelete: true },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset ${id} not found.`);
    }

    if (!dataset.canDelete) {
      throw new BadRequestException('This item cannot be deleted.');
    }

    await this.prisma.dataset.delete({ where: { id } });
    return this.getManagedDatasets(type);
  }

  private async buildUniqueSlug(name: string) {
    const baseSlug = slugify(name);
    const exists = await this.prisma.product.count({
      where: { productSlugName: baseSlug, deletedAt: null },
    });

    return exists ? `${baseSlug}-${Date.now()}` : baseSlug;
  }

  private async resolveProductSlug(
    name: string,
    requestedSlug?: string,
    ignoreId?: number,
  ) {
    if (!requestedSlug?.trim()) {
      return this.buildUniqueSlug(name);
    }

    const normalized = slugify(requestedSlug);
    const exists = await this.prisma.product.count({
      where: {
        productSlugName: normalized,
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
    });

    if (exists) {
      throw new BadRequestException(`Product slug "${normalized}" is already in use.`);
    }

    return normalized;
  }

  private async validateOfferableIds(
    variants: CreateProductDto['productVariants'],
  ) {
    const relatedProductIds = Array.from(
      new Set(
        variants.flatMap((variant) => [
          ...(variant.supplyProducts ?? []),
          ...(variant.titrationProducts ?? []),
        ]),
      ),
    );

    if (!relatedProductIds.length) {
      return;
    }

    const relatedVariants = await this.prisma.productVariant.findMany({
      where: {
        productId: { in: relatedProductIds },
        deletedAt: null,
      },
      select: {
        productId: true,
        doctorNetworkId: true,
        docNetworkOfferingId: true,
      },
    });

    const variantsByProductId = new Map<
      number,
      Array<{
        doctorNetworkId: number | null;
        docNetworkOfferingId: string | null;
      }>
    >();

    for (const relatedVariant of relatedVariants) {
      const current = variantsByProductId.get(relatedVariant.productId) ?? [];
      current.push({
        doctorNetworkId: relatedVariant.doctorNetworkId,
        docNetworkOfferingId: relatedVariant.docNetworkOfferingId,
      });
      variantsByProductId.set(relatedVariant.productId, current);
    }

    for (const variant of variants) {
      const currentNetworkId = variant.doctor.networkId;
      const mainOfferingId = variant.doctor.offrableId;

      if (!currentNetworkId || !mainOfferingId) {
        continue;
      }

      const supplyOfferableIds: string[] = [];
      for (const supplyProductId of variant.supplyProducts ?? []) {
        const supplyVariants = variantsByProductId.get(supplyProductId) ?? [];
        for (const supplyVariant of supplyVariants) {
          if (supplyVariant.docNetworkOfferingId) {
            supplyOfferableIds.push(supplyVariant.docNetworkOfferingId);
          }

          if (
            supplyVariant.doctorNetworkId === currentNetworkId &&
            supplyVariant.docNetworkOfferingId === mainOfferingId
          ) {
            throw new BadRequestException(
              "The supply product's offerable ID should not match with this variant's offerable ID. Please choose a different supply product or offerable ID.",
            );
          }
        }
      }

      const titrationOfferableIds: string[] = [];
      for (const titrationProductId of variant.titrationProducts ?? []) {
        const titrationVariants = variantsByProductId.get(titrationProductId) ?? [];
        for (const titrationVariant of titrationVariants) {
          if (titrationVariant.docNetworkOfferingId) {
            titrationOfferableIds.push(titrationVariant.docNetworkOfferingId);
          }

          if (
            titrationVariant.doctorNetworkId === currentNetworkId &&
            titrationVariant.docNetworkOfferingId === mainOfferingId
          ) {
            throw new BadRequestException(
              "The titration product's Offerable ID should not match with this variant's Offerable ID. Please choose a different titration product or offerable ID.",
            );
          }
        }
      }

      if (
        supplyOfferableIds.length &&
        titrationOfferableIds.length &&
        supplyOfferableIds.some((offerableId) => titrationOfferableIds.includes(offerableId))
      ) {
        throw new BadRequestException(
          'Titration product doctor network ID and supply product doctor network ID should not match.',
        );
      }
    }
  }

  private async validateVariantBusinessRules(
    variants: CreateProductDto['productVariants'],
    swappableProductIds?: number[],
    swappableProductQuestionaries?: number,
  ) {
    if (!variants.length) {
      return;
    }

    if (swappableProductIds?.length && !swappableProductQuestionaries) {
      throw new BadRequestException(
        'The swappable product questionnaire field is required when swappable products are selected.',
      );
    }

    if (variants.some((variant) => !(variant.crm.plans?.length))) {
      throw new BadRequestException(
        'Each product variant must include at least one subscription plan.',
      );
    }

    const metaDataValues = variants
      .map((variant) => variant.doctor.metaData?.trim())
      .filter((value): value is string => Boolean(value));

    if (
      metaDataValues.length !== variants.length ||
      new Set(metaDataValues).size > 1
    ) {
      throw new BadRequestException(
        'The Meta data field is required and every variant should have same meta data.',
      );
    }

    const currentOfferableIds = variants
      .map((variant) => variant.doctor.offrableId?.trim())
      .filter((value): value is string => Boolean(value));

    if (new Set(currentOfferableIds).size !== currentOfferableIds.length) {
      throw new BadRequestException(
        'Each product variant must have a unique Offerable ID.',
      );
    }

    if (!swappableProductIds?.length) {
      return;
    }

    const swappableVariants = await this.prisma.productVariant.findMany({
      where: {
        productId: { in: swappableProductIds },
        deletedAt: null,
      },
      select: {
        productId: true,
        docNetworkOfferingId: true,
        product: {
          select: { name: true },
        },
      },
    });

    for (const swappableVariant of swappableVariants) {
      if (
        !swappableVariant.docNetworkOfferingId ||
        !currentOfferableIds.includes(swappableVariant.docNetworkOfferingId)
      ) {
        continue;
      }

      throw new BadRequestException(
        `The swappable treatment "${swappableVariant.product.name}" contains variants with Offerable ID "${swappableVariant.docNetworkOfferingId}" that already exists in the current product variants.`,
      );
    }
  }

  private async validateCreateReferences(dto: CreateProductDto) {
    await this.validateQuestionnaireReferences({
      generalQuestion: dto.generalQuestion,
      medicalQuestion: dto.medicalQuestion,
      swappableProductQuestionaries: dto.swappableProductQuestionaries,
    });
    await this.validateSwappableProducts(dto.swappableProductIds, dto.productType);
  }

  private async validateUpdateReferences(dto: UpdateProductDto, productId?: number) {
    await this.validateQuestionnaireReferences({
      generalQuestion: dto.generalQuestion,
      medicalQuestion: dto.medicalQuestion,
      swappableProductQuestionaries: dto.swappableProductQuestionaries,
    });
    await this.validateSwappableProducts(
      dto.swappableProductIds,
      dto.productType,
      productId,
    );
  }

  private async validateQuestionnaireReferences(input: {
    generalQuestion?: number;
    medicalQuestion?: number;
    swappableProductQuestionaries?: number;
  }) {
    const ids = [
      input.generalQuestion,
      input.medicalQuestion,
      input.swappableProductQuestionaries,
    ].filter((value): value is number => typeof value === 'number');

    if (!ids.length) {
      return;
    }

    const rows = await this.prisma.questionnaire.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const found = new Set(rows.map((row: { id: any; }) => row.id));

    for (const id of ids) {
      if (!found.has(id)) {
        throw new BadRequestException(`Questionnaire ${id} does not exist.`);
      }
    }
  }

  private async validateSwappableProducts(
    swappableProductIds?: number[],
    productType?: string,
    ignoreProductId?: number,
  ) {
    if (!swappableProductIds?.length) {
      return;
    }

    const rows = await this.prisma.product.findMany({
      where: {
        id: { in: swappableProductIds },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        productType: true,
        productClassification: true,
        status: true,
      },
    });
    const foundById = new Map(rows.map((row) => [row.id, row]));

    for (const productId of swappableProductIds) {
      const row = foundById.get(productId);

      if (!row) {
        throw new BadRequestException(
          `Swappable product ${productId} does not exist.`,
        );
      }

      if (ignoreProductId && row.id === ignoreProductId) {
        throw new BadRequestException(
          'The current product cannot be selected as a swappable treatment.',
        );
      }

      if (!row.status) {
        throw new BadRequestException(
          `The swappable treatment "${row.name}" is inactive.`,
        );
      }

      if (row.productClassification !== ProductClassification.main) {
        throw new BadRequestException(
          `The swappable treatment "${row.name}" must be a main product.`,
        );
      }

      if (productType && row.productType !== productType) {
        throw new BadRequestException(
          `The swappable treatment "${row.name}" must match the selected product type.`,
        );
      }
    }
  }

  private async getSubscriptionPlans(tx: any = this.prisma) {
    return tx.subscriptionPlan.findMany({
      where: { status: '1' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    }) as Promise<SubscriptionPlanOption[]>;
  }

  private async getVariantPlans(
    variantIds: number[],
    tx: any = this.prisma,
  ) {
    const plansByVariantId = new Map<number, Array<Record<string, unknown>>>();

    if (!variantIds.length) {
      return plansByVariantId;
    }

    const rows = await tx.planVariantPrice.findMany({
      where: {
        productVariantId: { in: variantIds },
      },
      select: {
        productVariantId: true,
        planId: true,
        crmCampaignId: true,
        crmOfferId: true,
        shippingProfile: true,
        durationWeeks: true,
        supplyWeeks: true,
        originalPrice: true,
        discountAmount: true,
        discountCoupon: true,
        isDefault: true,
        status: true,
        subscriptionPlan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        { productVariantId: 'asc' },
        { planId: 'asc' },
      ],
    });

    for (const row of rows) {
      const variantId = Number(row.productVariantId);
      const current = plansByVariantId.get(variantId) ?? [];
      current.push({
        planId: Number(row.planId),
        planName: row.subscriptionPlan.name,
        crmCampaignId: row.crmCampaignId === null ? null : Number(row.crmCampaignId),
        crmOfferId: row.crmOfferId === null ? null : Number(row.crmOfferId),
        shippingProfile: row.shippingProfile === null ? null : Number(row.shippingProfile),
        durationWeeks: Number(row.durationWeeks ?? 0),
        supplyWeeks: Number(row.supplyWeeks ?? 0),
        sellingPrice: Number(row.originalPrice ?? 0),
        discountAmount: Number(row.discountAmount ?? 0),
        discountCoupon: row.discountCoupon,
        isDefault: Boolean(row.isDefault),
        status: row.status === null ? true : Boolean(row.status),
      });
      plansByVariantId.set(variantId, current);
    }

    return plansByVariantId;
  }

  private serializeProduct<T extends ProductRecord>(product: T): T & {
    image: unknown;
    restrictedState: string[];
    keypoints: string[];
    genderAvailability?: string;
    generalQuestionId?: number | null;
  } {
    const normalizedVariants = Array.isArray((product as { variants?: unknown[] }).variants)
      ? ((product as { variants?: Array<Record<string, unknown>> }).variants ?? []).map(
          (variant) => ({
            ...variant,
            image: safeParseDbJson<string[] | string | null>(
              typeof variant.image === 'string' ? variant.image : null,
              typeof variant.image === 'string' ? variant.image : null,
            ),
            crmId:
              variant.crmId ??
              (variant.crmCampaign as { crmId?: number | null } | undefined)?.crmId ??
              (variant.crmOffer as { crmId?: number | null } | undefined)?.crmId ??
              (variant.shippingProfile as { crmId?: number | null } | undefined)?.crmId ??
              null,
            crmCampaignId:
              variant.crmCampaignId ??
              (variant.crmOffer as { crmCampaignId?: number | null } | undefined)?.crmCampaignId ??
              (variant.shippingProfile as { crmCampaignId?: number | null } | undefined)?.crmCampaignId ??
              null,
            crmShippingProfileId:
              variant.crmShippingProfileId ?? variant.shippingProfileId ?? null,
            quantity: variant.quantity ?? variant.doctorQuantity ?? null,
            daysSupply: variant.daysSupply ?? variant.daysSupplies ?? null,
            dispenseUnit: variant.dispenseUnit ?? variant.dispenseUnits ?? null,
            prescriptionDuration:
              variant.prescriptionDuration ??
              variant.doctorPrescriptionDuration ??
              null,
            offrableId: variant.offrableId ?? variant.docNetworkOfferingId ?? null,
            metaData:
              variant.metaData ??
              (product as { metaData?: string | null }).metaData ??
              null,
          }),
        )
      : (product as { variants?: unknown[] }).variants;

    return {
      ...product,
      ...(normalizedVariants ? { variants: normalizedVariants } : {}),
      genderAvailability:
        (normalizedVariants?.[0] as { gender?: string } | undefined)?.gender ??
        (product as { genderAvailability?: string }).genderAvailability,
      generalQuestionId:
        (product as { generalQuestionId?: number | null; genericQuestionId?: number | null })
          .generalQuestionId ??
        (product as { genericQuestionId?: number | null }).genericQuestionId ??
        null,
      image: safeParseDbJson(product.image, []),
      restrictedState: parseDbJsonArray(product.restrictedState),
      keypoints: parseDbJsonArray(product.keypoints),
    };
  }

  private normalizeBigInts<T>(value: T): T {
    if (typeof value === 'bigint') {
      return Number(value) as T;
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
