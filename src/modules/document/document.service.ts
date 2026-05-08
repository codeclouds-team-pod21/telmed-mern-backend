import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { FunnelStep } from '@prisma/client';

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

type ExternalQuestionnaireNode = {
  type?: string | null;
  title?: string | null;
  label?: string | null;
  description?: string | null;
  is_important?: boolean | null;
  is_critical?: boolean | null;
  display_in_pdf?: boolean | null;
  partner_questionnaire_question_id?: string | null;
  rules?: Array<{
    requirements?: Array<{
      based_on?: string | null;
      required_answer?: string | null;
      required_question_id?: string | null;
    }> | null;
  }> | null;
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
    const networkConfig = {
      id: variant.doctorNetwork.id,
      apiUrl: variant.doctorNetwork.apiUrl,
      apiVersion: variant.doctorNetwork.apiVersion,
      credentials: variant.doctorNetwork.credentials,
    };
    const mediaPayload = dto.idWebcam
      ? this.buildBase64MediaPayload(dto.idWebcam, 'ID', path.basename(storedPath))
      : await this.buildPathMediaPayload(storedPath, 'ID');

    if (!mediaPayload) {
      throw new BadRequestException('Unable to prepare identity media for doctor network upload.');
    }

    const doctorNetworkResponse = (await this.mdiProvider.addMediaToDoctorNetwork(
      networkConfig,
      mediaPayload,
    )) as Record<string, unknown>;
    const uploadRoot = this.resolveMdiRoot(doctorNetworkResponse);
    const doctorNetworkFileId = String(uploadRoot?.file_id ?? '').trim() || null;
    const publicUrl = String(uploadRoot?.url ?? '').trim() || null;

    if (!doctorNetworkFileId) {
      throw new BadRequestException('Failed to upload identity document to doctor network.');
    }

    const document = await this.prisma.document.create({
      data: {
        path: storedPath,
        publicUrl,
        doctorNetworkFileId,
        type: DocumentType.ID,
        customerId,
        doctorsNetworkId: variant.doctorNetworkId,
      },
    });

    const nextStep = await this.completeIdentityStep(
      customerId,
      dto.productVariantId,
    );

    return normalizeBigInts({
      success: true,
      document,
      externalSyncPending: nextStep !== FunnelStep.dashboard,
      nextStep,
    });
  }

  async uploadSsn(customerId: number, dto: UploadSsnDto) {
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { ssn: dto.ssn },
    });

    const latestAuthorizedOrder = await this.prisma.order.findFirst({
      where: {
        customerId,
        orderStatus: 'authorized',
      },
      include: {
        items: {
          orderBy: { id: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const productVariantId = latestAuthorizedOrder?.items[0]?.productVariantId;

    if (!productVariantId) {
      throw new NotFoundException('Authorized order not found');
    }

    const nextStep = await this.completeIdentityStep(customerId, productVariantId);

    return normalizeBigInts({
      success: true,
      customer,
      externalSyncPending: nextStep !== FunnelStep.dashboard,
      nextStep,
    });
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
    const networkConfig = {
      id: variant.doctorNetwork.id,
      apiUrl: variant.doctorNetwork.apiUrl,
      apiVersion: variant.doctorNetwork.apiVersion,
      credentials: variant.doctorNetwork.credentials,
    };
    const mediaPayload = dto.videoDataUrl
      ? this.buildBase64MediaPayload(
          dto.videoDataUrl,
          'VIDEO',
          path.basename(storedPath),
        )
      : await this.buildPathMediaPayload(storedPath, 'VIDEO');

    if (!mediaPayload) {
      throw new BadRequestException('Unable to prepare video media for doctor network upload.');
    }

    const doctorNetworkResponse = (await this.mdiProvider.addMediaToDoctorNetwork(
      networkConfig,
      mediaPayload,
    )) as Record<string, unknown>;
    const uploadRoot = this.resolveMdiRoot(doctorNetworkResponse);
    const doctorNetworkFileId = String(uploadRoot?.file_id ?? '').trim() || null;
    const publicUrl = String(uploadRoot?.url ?? '').trim() || null;

    if (!doctorNetworkFileId) {
      throw new BadRequestException('Failed to upload video to doctor network.');
    }

    const document = await this.prisma.document.create({
      data: {
        path: storedPath,
        publicUrl,
        doctorNetworkFileId,
        type: DocumentType.VIDEO,
        customerId,
        doctorsNetworkId: variant.doctorNetworkId,
      },
    });

    await this.patientService.updatePatientWithVideo({
      customerId,
      productVariantId: dto.productVariantId,
    });
    await this.updateLatestFunnelProgress(customerId, FunnelStep.dashboard);

    return normalizeBigInts({
      success: true,
      document,
      externalSyncPending: false,
      nextStep: FunnelStep.dashboard,
    });
  }

  async resolvePostCheckoutStep(customerId: number, productVariantId: number) {
    const status = await this.getDocumentStatus(customerId, productVariantId);

    if (!status.idCount && !status.hasSsn) {
      return FunnelStep.identity_upload;
    }

    const caseResult = await this.createCaseForCustomer(customerId, productVariantId);
    if (!caseResult?.success) {
      throw new BadRequestException(
        typeof caseResult?.message === 'string' && caseResult.message.trim()
          ? caseResult.message
          : 'Unable to create doctor case.',
      );
    }

    if (status.requiresVideo && !status.videoCount) {
      return FunnelStep.video_upload;
    }

    return FunnelStep.dashboard;
  }

  async createCaseForCustomer(
    customerId: number,
    productVariantId: number,
    isSwap = false,
  ) {
    let patientSync:
      | {
          success?: boolean;
          patient?: unknown;
          message?: string | null;
        }
      | null = null;

    try {
      patientSync = await this.patientService.syncPatient({
        customerId,
        productVariantId,
      });
    } catch (error) {
      return normalizeBigInts({
        success: false,
        patientSync: null,
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Doctor network patient sync failed.',
        externalSyncPending: true,
      });
    }

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

    const patientSyncMessage =
      typeof patientSync?.message === 'string' ? patientSync.message.trim() : '';
    const hasPendingPatientId = String(
      patient.doctorNetworkPatientId ?? '',
    ).startsWith('pending-');

    if (patientSync?.success === false || hasPendingPatientId) {
      return normalizeBigInts({
        success: false,
        patientSync,
        message:
          patientSyncMessage && patientSyncMessage !== 'Something went wrong.'
            ? patientSyncMessage
            : 'Doctor network patient sync is still pending. Please retry after the patient sync completes.',
        externalSyncPending: true,
      });
    }

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

    const [customer, answer, genericAnswer, documents, vitalsAnswer] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({
        where: { id: customerId },
      }),
      this.prisma.answer.findFirst({
        where: {
          customerId,
          ...(isSwap
            ? { questionnaire: { type: 'swap' as never } }
            : {}),
        },
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
      this.prisma.answer.findFirst({
        where: {
          customerId,
          questionnaire: { type: 'vitals' as never },
        },
        orderBy: { createdAt: 'desc' },
        include: { questionnaire: true },
      }),
    ]);

    if (!answer) {
      throw new NotFoundException('Questionnaire answers not found');
    }

    const fileIds = [] as string[];
    const mainAnswers = safeParseDbJson<AnswerMap>(answer.answers, {});
    const genericAnswers =
      !isSwap && genericAnswer
        ? safeParseDbJson<AnswerMap>(genericAnswer.answers, {})
        : {};
    const vitalsAnswers = vitalsAnswer
      ? safeParseDbJson<AnswerMap>(vitalsAnswer.answers, {})
      : {};

    const uploadedMainAnswers = await this.uploadAnswerFilesToDoctorNetwork(
      variant.doctorNetwork,
      mainAnswers,
      customer.email,
      this.getSendToDnFileFields(answer.questionnaire?.questions),
      fileIds,
    );
    const uploadedGenericAnswers =
      !isSwap && genericAnswer
        ? await this.uploadAnswerFilesToDoctorNetwork(
            variant.doctorNetwork,
            genericAnswers,
            customer.email,
            this.getSendToDnFileFields(genericAnswer?.questionnaire?.questions),
            fileIds,
          )
        : {};
    const uploadedVitalsAnswers = vitalsAnswer
      ? await this.uploadAnswerFilesToDoctorNetwork(
          variant.doctorNetwork,
          vitalsAnswers,
          customer.email,
          this.getSendToDnFileFields(vitalsAnswer.questionnaire?.questions),
          fileIds,
        )
      : {};

    const allAnswers = {
      ...uploadedGenericAnswers,
      ...uploadedMainAnswers,
      ...uploadedVitalsAnswers,
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
        ...(!isSwap
          ? this.formatAnswersForCase(
              genericAnswer?.questionnaire?.questions,
              genericAnswer?.questionnaire?.intakeEngineType,
              uploadedGenericAnswers,
            )
          : []),
        ...this.formatAnswersForCase(
          answer.questionnaire?.questions,
          answer.questionnaire?.intakeEngineType,
          uploadedMainAnswers,
        ),
        ...this.formatAnswersForCase(
          vitalsAnswer?.questionnaire?.questions,
          vitalsAnswer?.questionnaire?.intakeEngineType,
          uploadedVitalsAnswers,
        ),
      ],
    };

    const response = (await this.mdiProvider.createCase(
      {
        apiUrl: variant.doctorNetwork.apiUrl,
        apiVersion: variant.doctorNetwork.apiVersion,
        credentials: variant.doctorNetwork.credentials,
      },
      payload,
    )) as { success?: boolean; data?: { case_id?: string }; case_id?: string; message?: string };
    const responseRoot = this.resolveMdiRoot(response);
    const caseId = String(responseRoot?.case_id ?? '').trim() || null;
    const isSuccessful = response?.success !== false && Boolean(caseId);

    const userCase = await this.prisma.userCase.create({
      data: {
        orderId: order.id,
        patientId: patient.id,
        caseId,
        status: isSuccessful ? 'created' : 'pending',
        reason: response?.message ?? null,
      },
    });

    if (isSuccessful && caseId && fileIds.length) {
      await this.mdiProvider.attachFilesToCase(
        {
          apiUrl: variant.doctorNetwork.apiUrl,
          apiVersion: variant.doctorNetwork.apiVersion,
          credentials: variant.doctorNetwork.credentials,
        },
        caseId,
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
      success: isSuccessful,
      userCase,
      patientSync,
      message: response?.message,
      externalSyncPending: !isSuccessful,
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

  private async completeIdentityStep(
    customerId: number,
    productVariantId: number,
  ) {
    const nextStep = await this.resolvePostCheckoutStep(
      customerId,
      productVariantId,
    );
    await this.updateLatestFunnelProgress(customerId, nextStep);
    return nextStep;
  }

  private async updateLatestFunnelProgress(
    customerId: number,
    step: FunnelStep,
  ) {
    const progress = await this.prisma.funnelProgress.findFirst({
      where: {
        customerId,
        deletedAt: null,
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    if (!progress) {
      return;
    }

    await this.prisma.funnelProgress.update({
      where: { id: progress.id },
      data: { steps: step },
    });
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
    const normalizedType = this.normalizeDoctorNetworkMediaType(remoteType);
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    try {
      const buffer = await fs.readFile(resolvedPath);
      const contentType = this.mimeTypeForPath(resolvedPath, remoteType);
      const formData = new FormData();
      formData.append('name', normalizedType);
      formData.append('type', normalizedType);
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
    const normalizedType = this.normalizeDoctorNetworkMediaType(remoteType);
    const [, mimeType = 'image/png', encoded = ''] =
      dataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];

    if (!encoded) {
      return null;
    }

    const formData = new FormData();
    formData.append('name', normalizedType);
    formData.append('type', normalizedType);
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

  private normalizeDoctorNetworkMediaType(remoteType: string) {
    const normalized = String(remoteType).trim().toUpperCase();

    switch (normalized) {
      case 'VIDEO':
        return 'av-video';
      case 'ID':
        return 'driver-license';
      case 'ATTACHMENT':
        return 'attachment';
      case 'DOCUMENT':
      default:
        return 'document';
    }
  }

  private formatAnswersForCase(
    rawQuestions: string | null | undefined,
    intakeEngineType: string | null | undefined,
    answers: AnswerMap,
  ) {
    if ((intakeEngineType ?? 'custom') === 'external') {
      return this.formatExternalCaseQuestions(rawQuestions, answers);
    }

    return this.formatCaseQuestions(rawQuestions, answers);
  }

  private formatExternalCaseQuestions(
    rawQuestions: string | null | undefined,
    answers: AnswerMap,
  ) {
    const questionnaire = safeParseDbJson<ExternalQuestionnaireNode[]>(rawQuestions, []);
    const formatted = [] as Array<Record<string, unknown>>;

    for (const question of questionnaire) {
      if (!question || typeof question !== 'object') {
        continue;
      }

      if (!this.externalQuestionMatchesRules(question, answers)) {
        continue;
      }

      const field = String(question.partner_questionnaire_question_id ?? '').trim();
      if (!field) {
        continue;
      }

      if (question.type === 'informational' || field === 'patient_dob') {
        continue;
      }

      const answer = answers[field];
      if (!answer || answer.type === 'file') {
        continue;
      }

      const normalizedAnswer = this.normalizeExternalAnswer(question, answer);
      if (!normalizedAnswer.trim()) {
        continue;
      }

      formatted.push({
        question: question.title ?? question.label ?? field,
        answer: normalizedAnswer,
        type: 'string',
        important: Boolean(question.is_important ?? false),
        is_critical: Boolean(question.is_critical ?? false),
        display_in_pdf: Boolean(question.display_in_pdf ?? true),
        description: question.description ?? '',
        label: question.label ?? '',
        metadata: field,
      });
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

  private normalizeExternalAnswer(
    question: ExternalQuestionnaireNode,
    answer?: { type?: string; value?: unknown },
  ) {
    const normalized = this.normalizeAnswer(answer);

    if (question.type === 'boolean') {
      if (normalized === '1') {
        return 'Yes';
      }

      if (normalized === '0') {
        return 'No';
      }
    }

    return normalized;
  }

  private externalQuestionMatchesRules(
    question: ExternalQuestionnaireNode,
    answers: AnswerMap,
  ) {
    const rules = Array.isArray(question.rules) ? question.rules : [];
    if (!rules.length) {
      return true;
    }

    const requirements = rules.flatMap((rule) =>
      Array.isArray(rule.requirements) ? rule.requirements : [],
    );

    if (!requirements.length) {
      return true;
    }

    return requirements.every((requirement) => {
      if (requirement?.based_on !== 'question') {
        return true;
      }

      const field = String(requirement.required_question_id ?? '').trim();
      if (!field) {
        return true;
      }

      const actualValue = this.normalizeExternalRuleValue(answers[field]?.value);
      const expectedValue = String(requirement.required_answer ?? '').trim();

      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue);
      }

      return actualValue === expectedValue;
    });
  }

  private normalizeExternalRuleValue(value: unknown): string | string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? '').trim());
    }

    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    return String(value ?? '').trim();
  }

  private resolveMdiRoot(
    response:
      | {
          data?: Record<string, unknown>;
          case_id?: string;
          file_id?: string;
        }
      | undefined,
  ) {
    if (!response) {
      return null;
    }

    if (response.case_id || response.file_id) {
      return response as Record<string, unknown>;
    }

    return (response.data as Record<string, unknown> | undefined) ?? null;
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
