import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MdiProvider } from './providers/mdi.provider';

type DoctorOfferSyncResponse = {
  success?: boolean;
  message?: string;
  data?: Array<{
    offerable_id: string;
    name: string | null;
    quantity: number;
    days_of_supply: number;
    dispense_unit: string | null;
    refills: number;
    prescription_duration: number;
    pharmacy: string | null;
    meta_data: string | null;
  }>;
};

@Injectable()
export class DoctorNetworkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DoctorNetworkService.name);
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mdiProvider: MdiProvider,
  ) {}

  onModuleInit() {
    const intervalMs = Number(
      process.env.DOCTOR_NETWORK_REFRESH_INTERVAL_MS ?? 15 * 60 * 1000,
    );

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }

    this.refreshInterval = setInterval(() => {
      void this.refreshActiveTokens('mdi').catch((error: unknown) => {
        this.logger.error(
          `Doctor network token refresh failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private resolveProvider(type: string) {
    switch (type) {
      case 'mdi':
        return this.mdiProvider;
      default:
        throw new NotFoundException(`Unsupported doctor network type: ${type}`);
    }
  }

  async getOffers(doctorNetworkId: number) {
    const network = await this.prisma.doctorNetwork.findUnique({
      where: { id: doctorNetworkId },
    });

    if (!network) {
      throw new NotFoundException('Doctor network not found');
    }

    const offers = await this.prisma.doctorNetworkOffer.findMany({
      where: { doctorNetworkId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return offers.map((offer) => ({
      ...offer,
      prescriptionDuration: this.normalizePrescriptionDuration(
        offer.prescriptionDuration,
        offer.daysOfSupply,
      ),
    }));
  }

  async syncOffers(doctorNetworkId: number) {
    const network = await this.prisma.doctorNetwork.findUnique({
      where: { id: doctorNetworkId },
    });

    if (!network) {
      throw new NotFoundException('Doctor network not found');
    }

    const provider = this.resolveProvider(network.type);
    const response = (await provider.getDoctorNetworkOffers({
      id: network.id,
      apiUrl: network.apiUrl,
      apiVersion: network.apiVersion,
      credentials: network.credentials,
    })) as DoctorOfferSyncResponse | undefined;

    if (!response?.success || !response.data?.length) {
      return { success: false, message: response?.message ?? 'Offer not found' };
    }

    await this.prisma.$transaction(async (tx: any) => {
      await tx.doctorNetworkOffer.deleteMany({ where: { doctorNetworkId } });
      await tx.doctorNetworkOffer.createMany({
        data: response.data!.map((item) => ({
          doctorNetworkId,
          offerableId: item.offerable_id,
          name: item.name,
          quantity: item.quantity,
          daysOfSupply: item.days_of_supply,
          dispenseUnit: item.dispense_unit,
          refills: item.refills,
          prescriptionDuration: this.normalizePrescriptionDuration(
            item.prescription_duration,
            item.days_of_supply,
          ),
          pharmacy: item.pharmacy,
          metaData: item.meta_data,
        })),
      });
    });

    return {
      success: true,
      message: 'Data synced successfully',
      data: await this.getOffers(doctorNetworkId),
    };
  }

  async refreshActiveTokens(type = 'mdi') {
    const networks = await this.prisma.doctorNetwork.findMany({
      where: { type: type as 'mdi', status: true },
      orderBy: { id: 'asc' },
    });

    const data = [] as Array<{ id: number; name: string; refreshed: boolean }>;
    for (const network of networks) {
      const provider = this.resolveProvider(network.type);
      await provider.refreshToken?.(
        {
          id: network.id,
          apiUrl: network.apiUrl,
          apiVersion: network.apiVersion,
          credentials: network.credentials,
        },
        true,
      );

      data.push({
        id: network.id,
        name: network.name,
        refreshed: true,
      });
    }

    return {
      success: true,
      message: data.length
        ? 'Doctor network access tokens refreshed.'
        : 'No active doctor networks found.',
      data,
    };
  }

  async syncQuestionnaire(doctorNetworkId: number) {
    const network = await this.prisma.doctorNetwork.findUnique({
      where: { id: doctorNetworkId },
    });

    if (!network) {
      throw new NotFoundException('Doctor network not found');
    }

    const response = (await this.mdiProvider.getQuestionnaires({
      id: network.id,
      apiUrl: network.apiUrl,
      apiVersion: network.apiVersion,
      credentials: network.credentials,
    })) as {
      success?: boolean;
      data?: Array<Record<string, unknown>>;
      message?: string;
    };

    if (!response?.success) {
      return {
        success: false,
        message: response?.message ?? 'Unable to fetch questionnaires',
      };
    }

    const data = [] as Array<{ partnerQuestionnaireId: string; name: string | null }>;

    for (const item of response.data ?? []) {
      const partnerQuestionnaireId = String(
        item?.partner_questionnaire_id ?? '',
      ).trim();
      if (!partnerQuestionnaireId) {
        continue;
      }

      const questionsResponse = (await this.mdiProvider.getQuestionnaireQuestions(
        {
          id: network.id,
          apiUrl: network.apiUrl,
          apiVersion: network.apiVersion,
          credentials: network.credentials,
        },
        partnerQuestionnaireId,
      )) as { success?: boolean; data?: unknown };

      const name = item?.name ? String(item.name) : null;
      const questions = JSON.stringify(
        questionsResponse?.success ? (questionsResponse.data ?? []) : [],
      );
      const offerings = JSON.stringify(
        Array.isArray(item?.offerings) ? item.offerings : [],
      );

      const existing = await this.prisma.questionnaire.findFirst({
        where: {
          doctorNetworkId,
          partnerQuestionnaireId,
        },
        select: { id: true },
      });

      if (existing?.id) {
        await this.prisma.questionnaire.update({
          where: { id: existing.id },
          data: {
            name,
            questions,
            offerings,
            intakeEngineType: 'external',
            type: 'medical' as never,
            status: true,
            updatedAt: new Date(),
          },
        });
      } else {
        const now = new Date();
        await this.prisma.questionnaire.create({
          data: {
            partnerQuestionnaireId,
            name,
            questions,
            offerings,
            intakeEngineType: 'external',
            doctorNetworkId,
            type: 'medical' as never,
            status: true,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      data.push({ partnerQuestionnaireId, name });
    }

    return {
      success: true,
      message: 'Questionnaires synced successfully',
      data,
    };
  }

  private normalizePrescriptionDuration(
    prescriptionDuration?: number | null,
    daysOfSupply?: number | null,
  ) {
    const normalizedPrescriptionDuration = Number(prescriptionDuration ?? 0);
    if (normalizedPrescriptionDuration > 0) {
      return normalizedPrescriptionDuration;
    }

    const normalizedDaysOfSupply = Number(daysOfSupply ?? 0);
    return normalizedDaysOfSupply > 0 ? normalizedDaysOfSupply : 0;
  }
}
