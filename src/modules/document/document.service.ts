import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { normalizeBigInts } from '../../common/utils/bigint.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseDbJsonArray,
  safeParseDbJson,
} from '../../common/utils/json-db.util';
import { MdiProvider } from '../doctor-network/providers/mdi.provider';
import { PatientService } from '../patient/patient.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentType } from './document.enums';
import { UploadSsnDto } from './dto/upload-ssn.dto';
import { UploadVideoDto } from './dto/upload-video.dto';

type DocumentRecord = {
  type: DocumentType | string;
};

type AnswerMap = Record<
  string,
  {
    type?: string;
    value?: unknown;
    disk?: string;
  }
>;

type QuestionnaireNode = {
  question?: Record<string, any>;
  children?: QuestionnaireNode[];
  [key: string]: any;
};

@Injectable()
export class DocumentService {
  private readonly hardcodedVideoStates = ['AK', 'AR', 'DE', 'DC', 'IN'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly mdiProvider: MdiProvider,
    private readonly patientService: PatientService,
  ) {}

  async getDocumentStatus(customerId: number, productVariantId: number) {
    const patientVariant = await this.prisma.productVariant.findUnique({
      where: { id: productVariantId },
    });

    if (!patientVariant) {
      throw new NotFoundException('Product variant not found');
    }

    const documents = await this.prisma.document.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });

    return normalizeBigInts({
      idCount: documents.filter((doc: DocumentRecord) => doc.type === DocumentType.ID).length,
      videoCount: documents.filter((doc: DocumentRecord) => doc.type === DocumentType.VIDEO).length,
      hasSsn: Boolean((await this.prisma.customer.findUnique({ where: { id: customerId } }))?.ssn),
      requiresVideo: await this.requiresVideo(customerId, productVariantId),
      documents,
    });
  }

  async uploadDocument(customerId: number, dto: UploadDocumentDto) {
    if (!dto.idFilePath && !dto.idWebcam) {
      throw new NotFoundException('Document payload missing');
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.productVariantId },
      include: { doctorNetwork: true },
    });

    if (!variant?.doctorNetworkId || !variant.doctorNetwork) {
      throw new NotFoundException('Doctor network mapping not found');
    }

    const storedPath =
      dto.idFilePath ??
      `documents/webcam-${customerId}-${Date.now()}.png`;

    const document = await this.prisma.document.create({
      data: {
        path: storedPath,
        publicUrl: null,
        doctorNetworkFileId: null,
        type: DocumentType.ID,
        customerId,
        doctorsNetworkId: variant.doctorNetworkId,
      },
    });

    return normalizeBigInts({
      success: true,
      document,
      externalSyncPending: true,
    });
  }

  async uploadSsn(customerId: number, dto: UploadSsnDto) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { ssn: dto.ssn },
    });

    return normalizeBigInts({ success: true, customer });
  }

  async uploadVideo(customerId: number, dto: UploadVideoDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.productVariantId },
      include: { doctorNetwork: true },
    });

    if (!variant?.doctorNetworkId || !variant.doctorNetwork) {
      throw new NotFoundException('Doctor network mapping not found');
    }

    const storedPath =
      dto.videoPath?.trim() ||
      `videos/video-${customerId}-${Date.now()}.webm`;
    const document = await this.prisma.document.create({
      data: {
        path: storedPath,
        publicUrl: null,
        doctorNetworkFileId: null,
        type: DocumentType.VIDEO,
        customerId,
        doctorsNetworkId: variant.doctorNetworkId,
      },
    });

    return normalizeBigInts({
      success: true,
      document,
      externalSyncPending: true,
    });
  }

  async createCaseForCustomer(customerId: number, productVariantId: number) {
    const patientSync = await this.patientService.syncPatient({
      customerId,
      productVariantId,
    });

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: productVariantId },
      include: {
        product: true,
        doctorNetwork: true,
        relatedItems: {
          include: {
            additionalProduct: {
              include: {
                variants: {
                  where: { deletedAt: null },
                  orderBy: { id: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!variant?.doctorNetworkId || !variant.doctorNetwork) {
      throw new NotFoundException('Product variant not found');
    }

    const patient = await this.prisma.patient.findFirstOrThrow({
      where: {
        customerId,
        doctorNetworkId: variant.doctorNetworkId,
      },
    });

    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        orderStatus: 'authorized',
        productGroupName: variant.product.productGroupName,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!order) {
      throw new NotFoundException('Authorized order not found');
    }

    const [customer, answer, genericAnswer, documents] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({
        where: { id: customerId },
      }),
      this.prisma.answer.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        include: { questionnaire: true },
      }),
      this.prisma.answer.findFirst({
        where: {
          customerId,
          questionnaire: { type: 'general' as never },
        },
        orderBy: { createdAt: 'desc' },
        include: { questionnaire: true },
      }),
      this.prisma.document.findMany({
        where: {
          customerId,
          doctorsNetworkId: variant.doctorNetworkId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!answer) {
      throw new NotFoundException('Questionnaire answers not found');
    }

    const fileIds = [] as string[];
    const genericAnswers = genericAnswer
      ? safeParseDbJson<AnswerMap>(genericAnswer.answers, {})
      : {};
    const medicalAnswers = safeParseDbJson<AnswerMap>(answer.answers, {});
    const uploadedGenericAnswers = await this.uploadAnswerFilesToDoctorNetwork(
      variant.doctorNetwork,
      genericAnswers,
      customer.email,
      this.getSendToDnFileFields(genericAnswer?.questionnaire?.questions),
      fileIds,
    );
    const uploadedMedicalAnswers = await this.uploadAnswerFilesToDoctorNetwork(
      variant.doctorNetwork,
      medicalAnswers,
      customer.email,
      this.getSendToDnFileFields(answer.questionnaire?.questions),
      fileIds,
    );

    const allAnswers = {
      ...uploadedGenericAnswers,
      ...uploadedMedicalAnswers,
    };

    const bodyMatrixPayload = this.prepareBodyMatrixPayload(allAnswers);
    if (Object.keys(bodyMatrixPayload).length) {
      await this.mdiProvider.updatePatient(
        {
          apiUrl: variant.doctorNetwork.apiUrl,
          apiVersion: variant.doctorNetwork.apiVersion,
          credentials: variant.doctorNetwork.credentials,
        },
        patient.doctorNetworkPatientId,
        bodyMatrixPayload,
      );
    }

    const payload = {
      patient_id: patient.doctorNetworkPatientId,
      case_offerings: this.buildOfferings(variant),
      case_questions: [
        ...this.formatCaseQuestions(genericAnswer?.questionnaire?.questions, uploadedGenericAnswers),
        ...this.formatCaseQuestions(answer.questionnaire?.questions, uploadedMedicalAnswers),
      ],
    };

    const response = (await this.mdiProvider.createCase(
      {
        apiUrl: variant.doctorNetwork.apiUrl,
        apiVersion: variant.doctorNetwork.apiVersion,
        credentials: variant.doctorNetwork.credentials,
      },
      payload,
    )) as { success?: boolean; data?: { case_id?: string }; message?: string };

    const userCase = await this.prisma.userCase.create({
      data: {
        orderId: order.id,
        patientId: patient.id,
        caseId: response?.data?.case_id ?? null,
        status: response?.success ? 'created' : 'pending',
        reason: response?.message ?? null,
      },
    });

    if (response?.success && response.data?.case_id && fileIds.length) {
      await this.mdiProvider.attachFilesToCase(
        {
          apiUrl: variant.doctorNetwork.apiUrl,
          apiVersion: variant.doctorNetwork.apiVersion,
          credentials: variant.doctorNetwork.credentials,
        },
        response.data.case_id,
        fileIds,
      );
    }

    if (documents.length) {
      await this.prisma.document.updateMany({
        where: {
          id: {
            in: documents
              .filter((item) => item.caseId === null)
              .map((item) => item.id),
          },
        },
        data: {
          caseId: userCase.id,
        },
      });
    }

    return normalizeBigInts({
      success: response?.success ?? true,
      userCase,
      patientSync,
      message: response?.message,
      externalSyncPending: !response,
    });
  }

  async startBackgroundVerification(orderId?: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'partial',
        orderStatus: 'authorized',
        ...(orderId ? { id: orderId } : {}),
        customer: { patients: { none: {} } },
      },
      include: {
        customer: true,
        items: { orderBy: { id: 'desc' } },
      },
      take: orderId ? 1 : 5,
    });

    const results = [] as Array<Record<string, unknown>>;
    for (const order of orders) {
      const latestItem = order.items[0];
      if (!latestItem) {
        continue;
      }

      const patient = await this.patientService.syncPatient({
        customerId: order.customerId,
        productVariantId: latestItem.productVariantId,
      });

      const userCase = await this.createCaseForCustomer(
        order.customerId,
        latestItem.productVariantId,
      );

      results.push({
        orderId: order.id,
        customerId: order.customerId,
        patient,
        userCase,
      });
    }

    return normalizeBigInts({ success: true, results });
  }

  private async requiresVideo(customerId: number, productVariantId: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        customerId,
        items: {
          some: {
            productVariantId,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!order) {
      return false;
    }

    return this.hardcodedVideoStates.includes(String(order.shipState ?? '').toUpperCase());
  }

  private async buildPathMediaPayload(filePath: string, remoteType: string) {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    try {
      const buffer = await fs.readFile(resolvedPath);
      const contentType = this.mimeTypeForPath(resolvedPath, remoteType);
      const formData = new FormData();
      formData.append('name', remoteType);
      formData.append('type', remoteType);
      formData.append(
        'file',
        new Blob([buffer], { type: contentType }),
        path.basename(resolvedPath),
      );
      return formData;
    } catch {
      return null;
    }
  }

  private buildBase64MediaPayload(dataUrl: string, remoteType: string, fileName: string) {
    const [, mimeType = 'image/png', encoded = ''] =
      dataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];

    if (!encoded) {
      return null;
    }

    const formData = new FormData();
    formData.append('name', remoteType);
    formData.append('type', remoteType);
    formData.append(
      'file',
      new Blob([Buffer.from(encoded, 'base64')], { type: mimeType }),
      path.basename(fileName),
    );
    return formData;
  }

  private mimeTypeForPath(filePath: string, remoteType: string) {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.pdf':
        return 'application/pdf';
      case '.mov':
        return 'video/quicktime';
      case '.mp4':
        return 'video/mp4';
      default:
        return remoteType === 'av-video' ? 'video/mp4' : 'application/octet-stream';
    }
  }

  private buildOfferings(
    variant: {
      docNetworkOfferingId: string;
      isSupplyAvailable: boolean;
      isTitrationAvailable: boolean;
      relatedItems: Array<{
        type: string;
        additionalProduct: {
          variants: Array<{ docNetworkOfferingId: string }>;
        };
      }>;
    },
  ) {
    const offerings = new Map<string, { offering_id: string }>();

    if (variant.docNetworkOfferingId) {
      offerings.set(variant.docNetworkOfferingId, {
        offering_id: variant.docNetworkOfferingId,
      });
    }

    for (const related of variant.relatedItems) {
      if (related.type === 'supply' && !variant.isSupplyAvailable) {
        continue;
      }
      if (related.type === 'titration' && !variant.isTitrationAvailable) {
        continue;
      }

      const relatedVariant = related.additionalProduct.variants[0];
      if (relatedVariant?.docNetworkOfferingId) {
        offerings.set(relatedVariant.docNetworkOfferingId, {
          offering_id: relatedVariant.docNetworkOfferingId,
        });
      }
    }

    return Array.from(offerings.values());
  }

  private async uploadAnswerFilesToDoctorNetwork(
    network: {
      apiUrl: string;
      apiVersion: string | null;
      credentials: string;
    },
    answers: AnswerMap,
    customerEmail: string,
    allowedFileFields: string[],
    fileIds: string[],
  ) {
    const nextAnswers = { ...answers };

    for (const [key, answer] of Object.entries(nextAnswers)) {
      if (
        answer?.type !== 'file' ||
        !allowedFileFields.includes(key) ||
        typeof answer.value !== 'string' ||
        !answer.value.trim()
      ) {
        continue;
      }

      const formData = answer.value.startsWith('data:')
        ? this.buildBase64MediaPayload(answer.value, 'document', `${customerEmail}-${key}.png`)
        : await this.buildPathMediaPayload(answer.value, 'document');

      if (!formData) {
        continue;
      }

      const response = (await this.mdiProvider.addMediaToDoctorNetwork(
        {
          apiUrl: network.apiUrl,
          apiVersion: network.apiVersion,
          credentials: network.credentials,
        },
        formData,
      )) as { success?: boolean; data?: { url?: string; file_id?: string } };

      if (response?.success) {
        nextAnswers[key] = {
          ...answer,
          value: response.data?.url ?? answer.value,
        };
        if (response.data?.file_id) {
          fileIds.push(response.data.file_id);
        }
      }
    }

    return nextAnswers;
  }

  private prepareBodyMatrixPayload(answers: AnswerMap) {
    const payload = {} as Record<string, unknown>;
    const bmiValue = answers.bmi?.value;

    if (bmiValue && typeof bmiValue === 'object' && !Array.isArray(bmiValue)) {
      const height = this.coerceNumber((bmiValue as Record<string, unknown>).height);
      const weight = this.coerceNumber((bmiValue as Record<string, unknown>).weight);

      if (height > 0) {
        payload.height = Math.round(height * 2.54);
      }

      if (weight > 0) {
        payload.weight = Math.round(weight * 0.453592);
      }
    }

    if (answers.allergies) {
      const allergyAnswer = this.readAnswerString(answers, 'allergies');
      const allergyDetails = this.readAnswerString(answers, 'allergy_details');
      payload.allergies =
        allergyAnswer === 'Yes' && allergyDetails
          ? `Yes - ${allergyDetails}`
          : allergyAnswer;
    }

    if (answers.reported_meds) {
      const medsAnswer = this.readAnswerString(answers, 'reported_meds');
      const medDetails = this.readAnswerString(answers, 'medication_details');
      payload.current_medications =
        medsAnswer === 'Yes' && medDetails ? `Yes - ${medDetails}` : medsAnswer;
    }

    if (answers.conditions) {
      const conditionAnswer = this.readAnswerString(answers, 'conditions');
      const medList = this.readAnswerString(answers, 'med_list');
      payload.medical_conditions =
        conditionAnswer === 'Yes' && medList ? `Yes - ${medList}` : conditionAnswer;
    }

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== null && value !== ''),
    );
  }

  private formatCaseQuestions(rawQuestions: string | null | undefined, answers: AnswerMap) {
    const questionnaire = safeParseDbJson<QuestionnaireNode[]>(rawQuestions, []);
    const formatted = [] as Array<Record<string, unknown>>;

    for (const node of questionnaire) {
      this.processQuestionNode(node, answers, formatted);
    }

    return formatted;
  }

  private processQuestionNode(
    node: QuestionnaireNode,
    answers: AnswerMap,
    formatted: Array<Record<string, unknown>>,
  ) {
    const question = node.question ?? node;

    if (question?.send_to_dn) {
      const row = this.formatQuestionRow(question, answers);
      if (typeof row.answer === 'string' && row.answer.trim()) {
        formatted.push(row);
      }
    }

    const children = (question?.children ?? node.children ?? []) as QuestionnaireNode[];
    for (const child of children) {
      if (this.childMatches(child, answers)) {
        this.processQuestionNode(child, answers, formatted);
      }
    }
  }

  private formatQuestionRow(question: Record<string, any>, answers: AnswerMap) {
    const field = question.id;
    const answer = field ? answers[field] : undefined;

    return {
      question:
        question.ui?.question?.text ??
        question.ui?.header?.text ??
        question.label ??
        field ??
        '',
      answer: this.normalizeAnswer(answer),
      type: 'string',
      important: Boolean(question.important ?? false),
      is_critical: Boolean(question.is_critical ?? false),
      display_in_pdf: Boolean(question.display_in_pdf ?? true),
      description: question.description ?? '',
      label: question.label ?? '',
      metadata: question.metadata ?? '',
    };
  }

  private normalizeAnswer(answer?: { type?: string; value?: unknown }) {
    if (!answer) {
      return '';
    }

    if (answer.type === 'file') {
      return String(answer.value ?? '');
    }

    if (typeof answer.value === 'boolean') {
      return answer.value ? 'Yes' : 'No';
    }

    if (Array.isArray(answer.value)) {
      return answer.value
        .filter((item) => item !== null && item !== undefined && String(item).trim())
        .map((item) => String(item))
        .join(', ');
    }

    if (answer.value && typeof answer.value === 'object') {
      const record = answer.value as Record<string, unknown>;
      if (typeof record.bmi === 'string') {
        return record.bmi;
      }
      if (typeof record.formatted === 'string') {
        return record.formatted;
      }

      return Object.values(record)
        .filter((item) => item !== null && item !== undefined && String(item).trim())
        .map((item) => String(item))
        .join(', ');
    }

    return String(answer.value ?? '').trim();
  }

  private childMatches(node: QuestionnaireNode, answers: AnswerMap) {
    const rules = node.logic?.when ?? [];
    if (!Array.isArray(rules) || !rules.length) {
      return true;
    }

    return rules.every((rule: Record<string, unknown>) => {
      const field = String(rule.field ?? '');
      const operator = String(rule.op ?? '==');
      const expected = rule.value;
      const actual = answers[field]?.value;

      switch (operator) {
        case '!=':
          return actual !== expected;
        case '>':
          return this.coerceNumber(actual) > this.coerceNumber(expected);
        case '<':
          return this.coerceNumber(actual) < this.coerceNumber(expected);
        case '>=':
          return this.coerceNumber(actual) >= this.coerceNumber(expected);
        case '<=':
          return this.coerceNumber(actual) <= this.coerceNumber(expected);
        case 'in':
          return Array.isArray(expected) ? expected.includes(actual) : false;
        case 'not_in':
          return Array.isArray(expected) ? !expected.includes(actual) : true;
        case '==':
        default:
          return actual === expected;
      }
    });
  }

  private getSendToDnFileFields(rawQuestions: string | null | undefined) {
    const questionnaire = safeParseDbJson<QuestionnaireNode[]>(rawQuestions, []);
    const fields = [] as string[];

    const visit = (node: QuestionnaireNode) => {
      const question = node.question ?? node;
      if (question?.send_to_dn && typeof question.id === 'string') {
        fields.push(question.id);
      }

      const children = (question?.children ?? node.children ?? []) as QuestionnaireNode[];
      for (const child of children) {
        visit(child);
      }
    };

    for (const node of questionnaire) {
      visit(node);
    }

    return fields;
  }

  private readAnswerString(answers: AnswerMap, key: string) {
    const value = answers[key]?.value;
    if (typeof value === 'string') {
      return value;
    }
    return null;
  }

  private coerceNumber(value: unknown) {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (value && typeof value === 'object' && 'toString' in value) {
      const parsed = Number(String(value));
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
}
