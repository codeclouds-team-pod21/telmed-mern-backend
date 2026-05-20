import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FunnelStep } from '@prisma/client';
import { getFirstPendingQuestionnaireStage } from '../../common/config/funnel-flow.config';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateQuestionnaireDisqualification } from '../../common/utils/questionnaire-evaluator.util';
import {
  safeParseDbJson,
  stringifyDbJson,
} from '../../common/utils/json-db.util';
import { normalizeQuestionnaireAnswers } from '../../common/utils/questionnaire.util';
import { CreateQuestionnaireDto } from './dto/create-questionnaire.dto';
import { EvaluateQuestionnaireDto } from './dto/evaluate-questionnaire.dto';
import { SaveQuestionnaireDto } from './dto/save-questionnaire.dto';
import { QuestionnaireType } from './questionnaire-type.enum';

@Injectable()
export class QuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEngineType(value?: string | null) {
    return value ?? 'custom';
  }

  private normalizeQuestionPerGroup(value?: number | null) {
    return Math.max(1, Number(value ?? 1) || 1);
  }

  private normalizeSettingsKeySegment(value?: string | null) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private async getServiceEnvironmentMap(keys: string[]) {
    if (!keys.length) {
      return {} as Record<string, string>;
    }

    const rows = await this.prisma.serviceEnvironment.findMany({
      where: {
        key: {
          in: keys,
        },
      },
      select: {
        key: true,
        value: true,
      },
    });

    return Object.fromEntries(
      rows.map((row) => [row.key, row.value ?? '']),
    ) as Record<string, string>;
  }

  private async resolveInstanceQuestionnaireConfig(options: {
    type: QuestionnaireType;
    productCategory?: string | null;
  }) {
    const normalizedCategory = this.normalizeSettingsKeySegment(
      options.productCategory,
    );

    const keys = [
      ...(normalizedCategory &&
      (options.type === QuestionnaireType.general ||
        options.type === QuestionnaireType.medical ||
        options.type === QuestionnaireType.vitals)
        ? [
            `i_question_per_group_${
              options.type === QuestionnaireType.vitals
                ? 'body_matrix'
                : options.type
            }_${normalizedCategory}`,
          ]
        : []),
      ...(normalizedCategory &&
      (options.type === QuestionnaireType.general ||
        options.type === QuestionnaireType.medical)
        ? [`i_question_set_${options.type}_${normalizedCategory}`]
        : []),
    ];

    const rows = await this.getServiceEnvironmentMap(keys);
    const questionnaireId = normalizedCategory
      ? Number(rows[`i_question_set_${options.type}_${normalizedCategory}`] ?? 0) || null
      : null;
    const questionPerGroupKey = normalizedCategory
      ? `i_question_per_group_${
          options.type === QuestionnaireType.vitals
            ? 'body_matrix'
            : options.type
        }_${normalizedCategory}`
      : null;

    return {
      questionnaireId,
      questionPerGroup: Math.max(
        1,
        Number(
          (questionPerGroupKey ? rows[questionPerGroupKey] : undefined) ?? 1,
        ) || 1,
      ),
    };
  }

  private serializeQuestionnaire(
    questionnaire: {
      id: number;
      name: string | null;
      type: string;
      status: boolean;
      createdAt: Date | null;
      intakeEngineType: string | null;
      questionPerGroup?: number | null;
      questions: string;
    },
    options?: { questionPerGroupOverride?: number | null },
  ) {
    return {
      id: questionnaire.id,
      name: questionnaire.name,
      type: questionnaire.type,
      status: questionnaire.status,
      createdAt: questionnaire.createdAt,
      intakeEngineType: this.normalizeEngineType(questionnaire.intakeEngineType),
      questionPerGroup: this.normalizeQuestionPerGroup(
        options?.questionPerGroupOverride ?? questionnaire.questionPerGroup,
      ),
      questions: safeParseDbJson(questionnaire.questions, []),
    };
  }

  private async getQuestionnaireUsage(id: number) {
    const [genericProducts, medicalProducts, swapProducts] = await Promise.all([
      this.prisma.product.count({
        where: { deletedAt: null, genericQuestionId: id },
      }),
      this.prisma.product.count({
        where: { deletedAt: null, medicalQuestionId: id },
      }),
      this.prisma.product.count({
        where: { deletedAt: null, changeMedicineQuestionId: id },
      }),
    ]);

    const usedProductCount = genericProducts + medicalProducts + swapProducts;
    const canDelete = usedProductCount === 0;
    const deleteBlockedReason =
      canDelete
        ? null
        : 'This form is used in a product and cannot be deleted.';

    return {
      usedProductCount,
      canDelete,
      deleteBlockedReason,
    };
  }

  private async getPublicFunnelProduct(funnelProductId: number) {
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
      include: { product: true },
    });

    if (!funnelProduct) {
      throw new NotFoundException('Funnel product not found');
    }

    return funnelProduct;
  }

  getTypes() {
    return [
      { value: QuestionnaireType.general, label: 'General' },
      { value: QuestionnaireType.medical, label: 'Medical' },
      { value: QuestionnaireType.swap, label: 'Swap' },
    ];
  }

  async listQuestionnaires(filters?: {
    type?: string;
    searchText?: string;
    engineType?: string;
    status?: boolean;
  }) {
    const searchText = filters?.searchText?.trim();
    const parsedId =
      searchText && /^\d+$/.test(searchText) ? Number(searchText) : undefined;

    const rows = await this.prisma.questionnaire.findMany({
      where: {
        deletedAt: null,
        ...(filters?.type ? { type: filters.type as QuestionnaireType } : {}),
        ...(filters?.status === undefined ? {} : { status: filters.status }),
        ...(filters?.engineType
          ? filters.engineType === 'custom'
            ? {
                OR: [
                  { intakeEngineType: 'custom' },
                  { intakeEngineType: null },
                ],
              }
            : { intakeEngineType: filters.engineType }
          : {}),
        ...(searchText
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: searchText } },
                    ...(parsedId === undefined ? [] : [{ id: parsedId }]),
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
        intakeEngineType: true,
      },
      orderBy: { id: 'desc' },
    });

    return Promise.all(
      rows.map(async (row) => {
        const usage = await this.getQuestionnaireUsage(row.id);
        return {
          ...row,
          intakeEngineType: this.normalizeEngineType(row.intakeEngineType),
          canDelete: row.type === 'vitals' ? false : usage.canDelete,
          deleteBlockedReason:
            row.type === 'vitals'
              ? 'This questionnaire is restricted and cannot be deleted.'
              : usage.deleteBlockedReason,
        };
      }),
    );
  }

  async getQuestionnaire(questionaryId: number) {
    const questionnaire = await this.prisma.questionnaire.findFirst({
      where: { id: questionaryId, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
        intakeEngineType: true,
        questions: true,
      },
    });

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire row not found');
    }

    return this.serializeQuestionnaire(questionnaire);
  }

  async getProductQuestionnaire(
    funnelProductId: number,
    type: QuestionnaireType,
  ) {
    const funnelProduct = await this.getPublicFunnelProduct(funnelProductId);

    if (type === QuestionnaireType.vitals) {
      const instanceConfig = await this.resolveInstanceQuestionnaireConfig({
        type,
        productCategory: funnelProduct.product.productCategory,
      });
      const questionnaire = await this.prisma.questionnaire.findFirst({
        where: {
          deletedAt: null,
          status: true,
          type: QuestionnaireType.vitals,
        },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          createdAt: true,
          intakeEngineType: true,
          questions: true,
        },
      });

      if (!questionnaire) {
        return null;
      }

      return this.serializeQuestionnaire(questionnaire, {
        questionPerGroupOverride: instanceConfig.questionPerGroup,
      });
    }
    const instanceConfig = await this.resolveInstanceQuestionnaireConfig({
      type,
      productCategory: funnelProduct.product.productCategory,
    });

    const questionnaireId =
      instanceConfig.questionnaireId ??
      (type === QuestionnaireType.general
        ? funnelProduct.product.genericQuestionId
        : funnelProduct.product.medicalQuestionId);

    if (!questionnaireId) {
      return null;
    }

    const questionnaire = await this.prisma.questionnaire.findFirst({
      where: { id: questionnaireId, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
        intakeEngineType: true,
        questions: true,
      },
    });

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire row not found');
    }

    return this.serializeQuestionnaire(questionnaire, {
      questionPerGroupOverride: instanceConfig.questionPerGroup,
    });
  }

  async saveAnswers(customerId: number, dto: SaveQuestionnaireDto) {
    const questionnaire = await this.prisma.questionnaire.findFirst({
      where: { id: dto.questionaryId, deletedAt: null },
      select: { intakeEngineType: true },
    });

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire row not found');
    }

    if (this.normalizeEngineType(questionnaire.intakeEngineType) !== 'external') {
      const evaluation = await this.evaluateAnswers(dto);
      if (evaluation.disqualified) {
        throw new BadRequestException(
          evaluation.message ?? 'Based on your answers, you do not qualify for this program.',
        );
      }
    }

    const normalized = normalizeQuestionnaireAnswers(dto.answers);

    if (dto.type === QuestionnaireType.medical || dto.type === QuestionnaireType.vitals) {
      await this.syncMedicalCustomerProfile(customerId, dto.answers);
    }

    const existing = await this.prisma.answer.findFirst({
      where: {
        customerId,
        questionaryId: dto.questionaryId,
      },
    });

    const savedAnswer = existing
      ? await this.prisma.answer.update({
        where: { id: existing.id },
        data: { answers: stringifyDbJson(normalized) },
      })
      : await this.prisma.answer.create({
          data: {
            customerId,
            questionaryId: dto.questionaryId,
            answers: stringifyDbJson(normalized),
          },
        });

    if (dto.funnelProductId && dto.type) {
      await this.getPublicFunnelProduct(dto.funnelProductId);
      await this.upsertFunnelProgress(customerId, dto.funnelProductId, dto.type);
    }

    return savedAnswer;
  }

  async evaluateAnswers(dto: EvaluateQuestionnaireDto) {
    const questionnaire = await this.prisma.questionnaire.findFirst({
      where: { id: dto.questionaryId, deletedAt: null },
      select: { questions: true },
    });

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire row not found');
    }

    return evaluateQuestionnaireDisqualification(
      safeParseDbJson(questionnaire.questions, []),
      dto.answers ?? {},
    );
  }

  async create(dto: CreateQuestionnaireDto, userId?: number) {
    const now = new Date();
    const questionnaire = await this.prisma.questionnaire.create({
      data: {
        name: dto.name,
        type: dto.type as QuestionnaireType,
        status: dto.status ?? true,
        questions: stringifyDbJson(dto.questions) ?? '[]',
        intakeEngineType: 'custom',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      },
    });

    return {
      id: questionnaire.id,
      name: questionnaire.name,
      type: questionnaire.type,
      status: questionnaire.status,
      createdAt: questionnaire.createdAt,
      intakeEngineType: this.normalizeEngineType(questionnaire.intakeEngineType),
      questions: safeParseDbJson(questionnaire.questions, []),
    };
  }

  async update(id: number, dto: CreateQuestionnaireDto, userId?: number) {
    const questionnaire = await this.prisma.questionnaire.findFirst({
      where: { id, deletedAt: null },
    });

    if (!questionnaire) {
      throw new NotFoundException(`Questionnaire ${id} not found`);
    }

    this.assertEditable(questionnaire.type, questionnaire.intakeEngineType);

    const updated = await this.prisma.questionnaire.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type as QuestionnaireType,
        status: dto.status ?? questionnaire.status,
        questions: stringifyDbJson(dto.questions) ?? '[]',
        intakeEngineType: this.normalizeEngineType(questionnaire.intakeEngineType),
        updatedAt: new Date(),
        updatedBy: userId,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      status: updated.status,
      createdAt: updated.createdAt,
      intakeEngineType: this.normalizeEngineType(updated.intakeEngineType),
      questions: safeParseDbJson(updated.questions, []),
    };
  }

  async clone(id: number, name: string, userId?: number) {
    const questionnaire = await this.prisma.questionnaire.findFirst({
      where: { id, deletedAt: null },
    });

    if (!questionnaire) {
      throw new NotFoundException(`Questionnaire ${id} not found`);
    }

    if (questionnaire.type !== 'general' && questionnaire.type !== 'swap') {
      throw new BadRequestException('Cloning is only allowed for general and swap forms.');
    }

    const duplicate = await this.prisma.questionnaire.findFirst({
      where: {
        name,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException('A form with this name already exists.');
    }

    const now = new Date();
    const clone = await this.prisma.questionnaire.create({
      data: {
        name,
        type: questionnaire.type,
        status: questionnaire.status,
        questions: questionnaire.questions,
        doctorNetworkId: questionnaire.doctorNetworkId,
        intakeEngineType: 'custom',
        partnerQuestionnaireId: questionnaire.partnerQuestionnaireId,
        offerings: questionnaire.offerings ?? undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      },
    });

    return {
      id: clone.id,
      name: clone.name,
      type: clone.type,
      status: clone.status,
      createdAt: clone.createdAt,
      intakeEngineType: this.normalizeEngineType(clone.intakeEngineType),
      questions: safeParseDbJson(clone.questions, []),
    };
  }

  async remove(id: number, userId?: number) {
    const questionnaire = await this.prisma.questionnaire.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        type: true,
      },
    });

    if (!questionnaire) {
      throw new NotFoundException(`Questionnaire ${id} not found`);
    }

    if (questionnaire.type === 'vitals') {
      throw new BadRequestException('This questionnaire is restricted and cannot be deleted.');
    }

    const usage = await this.getQuestionnaireUsage(id);

    if (!usage.canDelete) {
      throw new BadRequestException(
        usage.deleteBlockedReason ?? 'This form is used in a product and cannot be deleted.',
      );
    }

    await this.prisma.questionnaire.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return { success: true };
  }

  private assertEditable(type: QuestionnaireType | string, intakeEngineType?: string | null) {
    if (intakeEngineType === 'external') {
      throw new BadRequestException('This questionnaire is restricted and cannot be edited.');
    }
  }

  private async syncMedicalCustomerProfile(
    customerId: number,
    answers: Record<string, unknown>,
  ) {
    const updates: { gender?: 'male' | 'female' | 'other'; dob?: Date } = {};
    const gender = answers.gender;
    const patientDob = answers.patient_dob;

    if (
      gender === 'male' ||
      gender === 'female' ||
      gender === 'other'
    ) {
      updates.gender = gender;
    }

    if (typeof patientDob === 'string' && patientDob.trim()) {
      const parsedDob = new Date(patientDob);
      if (!Number.isNaN(parsedDob.getTime())) {
        updates.dob = parsedDob;
      }
    }

    if (!Object.keys(updates).length) {
      return;
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: updates,
    });
  }

  private async upsertFunnelProgress(
    customerId: number,
    funnelProductId: number,
    type: string,
  ) {
    const funnelProduct = await this.prisma.funnelProduct.findFirst({
      where: {
        id: funnelProductId,
        deletedAt: null,
        status: true,
      },
      select: {
        product: {
          select: {
            productClassification: true,
          },
        },
      },
    });
    const existing = await this.prisma.funnelProgress.findFirst({
      where: {
        customerId,
        funnelProductId,
        deletedAt: null,
      },
      select: { id: true, smsConsent: true },
    });

    const [vitalsQuestionnaire, vitalsAnswer, medicalAnswer] = await Promise.all([
      this.prisma.questionnaire.findFirst({
        where: {
          deletedAt: null,
          status: true,
          type: QuestionnaireType.vitals,
        },
        select: { id: true },
        orderBy: { id: 'desc' },
      }),
      this.prisma.answer.findFirst({
        where: {
          customerId,
          questionnaire: {
            type: QuestionnaireType.vitals,
          },
        },
        select: { id: true },
        orderBy: { id: 'desc' },
      }),
      this.prisma.answer.findFirst({
        where: {
          customerId,
          questionnaire: {
            type: QuestionnaireType.medical,
          },
        },
        select: { id: true },
        orderBy: { id: 'desc' },
      }),
    ]);

    const pendingStage = getFirstPendingQuestionnaireStage({
      hasVitalsQuestionnaire: Boolean(vitalsQuestionnaire),
      hasVitalsAnswer: Boolean(vitalsAnswer),
      hasMedicalAnswer: Boolean(medicalAnswer),
      isSupplement:
        String(funnelProduct?.product?.productClassification ?? '').toLowerCase() === 'supplement',
    });

    const nextStep = pendingStage ? FunnelStep.medical_question : FunnelStep.checkout;

    if (existing) {
      await this.prisma.funnelProgress.update({
        where: { id: existing.id },
        data: {
          steps: nextStep,
        },
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
}
