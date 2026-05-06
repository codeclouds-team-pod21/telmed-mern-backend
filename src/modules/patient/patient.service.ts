import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { safeParseDbJson } from '../../common/utils/json-db.util';
import { MdiProvider } from '../doctor-network/providers/mdi.provider';
import { SyncPatientDto } from './dto/sync-patient.dto';

type AnswerMap = Record<
  string,
  {
    type?: string;
    value?: unknown;
    disk?: string;
  }
>;

@Injectable()
export class PatientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mdiProvider: MdiProvider,
  ) {}

  async syncPatient(dto: SyncPatientDto) {
    const mapping = await this.prisma.productVariant.findUnique({
      where: { id: dto.productVariantId },
      include: { doctorNetwork: true },
    });

    if (!mapping?.doctorNetworkId || !mapping.doctorNetwork) {
      throw new NotFoundException('Product variant doctor network mapping not found');
    }

    const [customer, existingPatient, order, answer, documents] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        include: {
          addresses: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.patient.findFirst({
        where: {
          customerId: dto.customerId,
          doctorNetworkId: mapping.doctorNetworkId,
        },
      }),
      this.prisma.order.findFirst({
        where: {
          customerId: dto.customerId,
          orderStatus: 'authorized',
          items: { some: { productVariantId: dto.productVariantId } },
        },
        include: { shippingAddress: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.answer.findFirst({
        where: { customerId: dto.customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.findMany({
        where: {
          customerId: dto.customerId,
          doctorsNetworkId: mapping.doctorNetworkId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const answers = safeParseDbJson<AnswerMap>(answer?.answers, {});
    const address = this.buildAddressPayload(customer, order?.shippingAddress ?? null);
    const payload = this.buildPatientPayload(customer, answers, address, documents);

    const response = existingPatient
      ? ((await this.mdiProvider.updatePatient(
          {
            apiUrl: mapping.doctorNetwork.apiUrl,
            apiVersion: mapping.doctorNetwork.apiVersion,
            credentials: mapping.doctorNetwork.credentials,
          },
          existingPatient.doctorNetworkPatientId,
          payload,
        )) as {
          success?: boolean;
          data?: { patient_id?: string };
          message?: string;
        })
      : ((await this.mdiProvider.createPatient(
          {
            apiUrl: mapping.doctorNetwork.apiUrl,
            apiVersion: mapping.doctorNetwork.apiVersion,
            credentials: mapping.doctorNetwork.credentials,
          },
          payload,
        )) as {
          success?: boolean;
          data?: { patient_id?: string };
          message?: string;
        });

    const patient = await this.prisma.patient.upsert({
      where: {
        customerId_doctorNetworkId: {
          customerId: dto.customerId,
          doctorNetworkId: mapping.doctorNetworkId,
        },
      },
      update: {
        doctorNetworkPatientId:
          response?.data?.patient_id ??
          existingPatient?.doctorNetworkPatientId ??
          `pending-${dto.customerId}-${mapping.doctorNetworkId}`,
      },
      create: {
        customerId: dto.customerId,
        doctorNetworkId: mapping.doctorNetworkId,
        doctorNetworkPatientId:
          response?.data?.patient_id ??
          `pending-${dto.customerId}-${mapping.doctorNetworkId}`,
      },
    });

    return {
      success: response?.success ?? true,
      patient,
      message: response?.message,
    };
  }

  async updatePatientWithVideo(dto: SyncPatientDto) {
    const mapping = await this.prisma.productVariant.findUnique({
      where: { id: dto.productVariantId },
      include: { doctorNetwork: true },
    });

    if (!mapping?.doctorNetworkId || !mapping.doctorNetwork) {
      throw new NotFoundException('Product variant doctor network mapping not found');
    }

    const [patient, customer, answer, documents] = await Promise.all([
      this.prisma.patient.findFirst({
        where: {
          customerId: dto.customerId,
          doctorNetworkId: mapping.doctorNetworkId,
        },
      }),
      this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      }),
      this.prisma.answer.findFirst({
        where: { customerId: dto.customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.findMany({
        where: {
          customerId: dto.customerId,
          doctorsNetworkId: mapping.doctorNetworkId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const answers = safeParseDbJson<AnswerMap>(answer?.answers, {});
    const payload = {
      intro_video_id: documents.find((item) => item.type === 'VIDEO')?.doctorNetworkFileId ?? null,
      date_of_birth: customer.dob ? customer.dob.toISOString().slice(0, 10) : null,
      weight: this.resolveWeight(customer.weight, answers),
      height: this.resolveHeight(customer.height, answers),
    };

    const response = (await this.mdiProvider.updatePatientWithVideo(
      {
        apiUrl: mapping.doctorNetwork.apiUrl,
        apiVersion: mapping.doctorNetwork.apiVersion,
        credentials: mapping.doctorNetwork.credentials,
      },
      patient.doctorNetworkPatientId,
      payload,
    )) as { success?: boolean; message?: string };

    return {
      success: response?.success ?? true,
      patient,
      message: response?.message,
    };
  }

  async findByCustomer(customerId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { customerId },
      include: { userCases: true, caseMessages: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  private buildAddressPayload(
    customer: {
      firstName: string;
      lastName: string | null;
      addresses: Array<{
        address1: string;
        address2: string | null;
        zipCode: string | null;
        city: string | null;
        state: string;
      }>;
    },
    shippingAddress: {
      address1: string;
      address2: string | null;
      zipCode: string | null;
      city: string | null;
      state: string;
    } | null,
  ) {
    const source = shippingAddress ?? customer.addresses[0];

    return {
      address: source?.address1 ?? '',
      address2: source?.address2 ?? '',
      zip_code: source?.zipCode ?? '',
      city_name: source?.city ?? '',
      state_name: source?.state ?? '',
      fname: customer.firstName,
      lname: customer.lastName ?? '',
    };
  }

  private buildPatientPayload(
    customer: {
      firstName: string;
      lastName: string | null;
      gender: string | null;
      dob: Date | null;
      phone: string | null;
      email: string;
      weight: unknown;
      height: unknown;
    },
    answers: AnswerMap,
    address: Record<string, unknown>,
    documents: Array<{ type: string; doctorNetworkFileId: string | null }>,
  ) {
    const driverLicenseId =
      documents.find((item) => item.type === 'ID')?.doctorNetworkFileId ?? null;
    const introVideoId =
      documents.find((item) => item.type === 'VIDEO')?.doctorNetworkFileId ?? null;
    const resolvedGender =
      customer.gender ??
      this.readAnswerString(answers, 'gender') ??
      this.readAnswerString(answers, 'patient_gender');
    const pregnancy =
      this.readAnswerBoolean(answers, 'pregnancy') ??
      this.readAnswerBoolean(answers, 'is_pregnant');

    const payload: Record<string, unknown> = {
      first_name: this.sanitizeName(customer.firstName),
      last_name: this.sanitizeName(customer.lastName ?? ''),
      gender:
        resolvedGender === 'female'
          ? 2
          : resolvedGender === 'male'
            ? 1
            : 0,
      date_of_birth: customer.dob ? customer.dob.toISOString().slice(0, 10) : null,
      phone_number: this.formatPhoneNumber(customer.phone),
      phone_type: 2,
      email: customer.email,
      address,
      weight: this.resolveWeight(customer.weight, answers),
      height: this.resolveHeight(customer.height, answers),
      allergies:
        this.readAnswerString(answers, 'allergy_details') ??
        this.readAnswerString(answers, 'allergies') ??
        'No I affirm I have no allergies',
      current_medications:
        this.readAnswerString(answers, 'medication_details') ??
        this.readAnswerString(answers, 'reported_meds') ??
        'No I affirm I take no medications',
      medical_conditions:
        this.readAnswerString(answers, 'conditions') ??
        this.readAnswerString(answers, 'med_list') ??
        'No I affirm I have no medical conditions',
    };

    if (resolvedGender === 'female' && typeof pregnancy === 'boolean') {
      payload.pregnancy = pregnancy;
    }

    if (driverLicenseId) {
      payload.driver_license_id = driverLicenseId;
    }

    if (introVideoId) {
      payload.intro_video_id = introVideoId;
    }

    return payload;
  }

  private sanitizeName(value: string) {
    return value.replace(/[^a-zA-Z\s]/g, '').trim();
  }

  private formatPhoneNumber(value?: string | null) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length !== 10) {
      return value ?? '';
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  private resolveHeight(customerHeight: unknown, answers: AnswerMap) {
    const existingHeight = this.coerceNumber(customerHeight);
    if (existingHeight > 0) {
      return existingHeight;
    }

    const bmiValue = answers.bmi?.value;
    if (bmiValue && typeof bmiValue === 'object' && !Array.isArray(bmiValue)) {
      const nestedHeight = this.coerceNumber(
        (bmiValue as Record<string, unknown>).height,
      );
      if (nestedHeight > 0) {
        return nestedHeight;
      }
    }

    return 0;
  }

  private resolveWeight(customerWeight: unknown, answers: AnswerMap) {
    const existingWeight = this.coerceNumber(customerWeight);
    if (existingWeight > 0) {
      return existingWeight;
    }

    const bmiValue = answers.bmi?.value;
    if (bmiValue && typeof bmiValue === 'object' && !Array.isArray(bmiValue)) {
      const nestedWeight = this.coerceNumber(
        (bmiValue as Record<string, unknown>).weight,
      );
      if (nestedWeight > 0) {
        return nestedWeight;
      }
    }

    return 0;
  }

  private readAnswerString(answers: AnswerMap, key: string) {
    const value = answers[key]?.value;

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(', ');
    }

    if (value && typeof value === 'object') {
      const maybeFormatted = (value as Record<string, unknown>).formatted;
      if (typeof maybeFormatted === 'string') {
        return maybeFormatted;
      }
    }

    return null;
  }

  private readAnswerBoolean(answers: AnswerMap, key: string) {
    const value = answers[key]?.value;

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (value.toLowerCase() === 'yes' || value.toLowerCase() === 'true') {
        return true;
      }
      if (value.toLowerCase() === 'no' || value.toLowerCase() === 'false') {
        return false;
      }
    }

    return null;
  }

  private coerceNumber(value: unknown) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    if (typeof value === 'bigint') {
      return Number(value);
    }

    if (value && typeof value === 'object' && 'toString' in value) {
      const parsed = Number(String(value));
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  }
}
