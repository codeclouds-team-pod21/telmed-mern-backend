import { BadRequestException, Injectable } from '@nestjs/common';
import { decryptStoredFields } from '../../../common/utils/encrypted-config.util';
import { safeParseDbJson } from '../../../common/utils/json-db.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { DoctorNetworkProvider } from '../interfaces/doctor-network-provider.interface';

type DoctorNetworkConfig = {
  id?: number;
  apiUrl: string;
  apiVersion?: string | null;
  credentials: string | Record<string, unknown>;
};

type MdiCredentials = {
  client_id?: string;
  client_secret?: string;
  clientId?: string;
  clientSecret?: string;
  grant_type?: string;
  scope?: string;
};

type MdiOfferingRecord = {
  offerable_id: string;
  name: string | null;
  quantity: number;
  days_of_supply: number;
  dispense_unit: string | null;
  refills: number;
  prescription_duration: number;
  pharmacy: string | null;
  meta_data: string | null;
};

type MdiApiResponse = Record<string, unknown> & {
  success?: boolean;
  data?: unknown;
  message?: string;
  error?: unknown;
};

@Injectable()
export class MdiProvider implements DoctorNetworkProvider {
  readonly type = 'mdi';

  constructor(private readonly prisma: PrismaService) {}

  async getDoctorNetworkOffers(network: DoctorNetworkConfig): Promise<unknown> {
    const payload = await this.requestWithToken(network, 'GET', 'partner/offerings');
    const source = this.extractCollection(payload);
    const data = source.length
      ? source.map((item) => this.normalizeOffering(item))
      : [];

    return {
      success: true,
      data,
      message: data.length ? 'Doctor network offerings fetched.' : 'No offerings returned.',
    };
  }

  async createPatient(network: DoctorNetworkConfig, payload: Record<string, unknown>) {
    return this.requestWithToken(network, 'POST', 'partner/patients', payload);
  }

  async updatePatient(
    network: DoctorNetworkConfig,
    patientId: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestWithToken(
      network,
      'PATCH',
      `partner/patients/${patientId}`,
      payload,
    );
  }

  async updatePatientWithVideo(
    network: DoctorNetworkConfig,
    patientId: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestWithToken(
      network,
      'PATCH',
      `partner/patients/${patientId}`,
      payload,
    );
  }

  async createCase(network: DoctorNetworkConfig, payload: Record<string, unknown>) {
    return this.requestWithToken(network, 'POST', 'partner/cases', payload);
  }

  async addMediaToDoctorNetwork(network: DoctorNetworkConfig, payload: FormData) {
    return this.requestWithToken(network, 'POST', 'partner/files', payload, false);
  }

  async attachFilesToCase(
    network: DoctorNetworkConfig,
    caseId: string,
    fileIds: string[],
  ) {
    const results = [] as Array<Record<string, any>>;

    for (const fileId of fileIds) {
      const response = await this.requestWithToken(
        network,
        'POST',
        `partner/cases/${caseId}/files/${fileId}`,
        undefined,
        false,
      );
      results.push(response);
    }

    return {
      success: true,
      data: results,
      message: 'Files attached to case.',
    };
  }

  async getQuestionnaires(network: DoctorNetworkConfig) {
    const payload = await this.requestWithToken(network, 'GET', 'partner/questionnaires');
    if (Array.isArray(payload)) {
      return {
        success: true,
        data: payload,
        message: payload.length ? 'Questionnaires fetched.' : 'No questionnaires returned.',
      };
    }

    return payload;
  }

  async getQuestionnaireQuestions(
    network: DoctorNetworkConfig,
    questionnaireId: string,
  ) {
    return this.requestWithToken(
      network,
      'GET',
      `partner/questionnaires/${questionnaireId}/questions`,
    );
  }

  async getMessagesByPatient(network: DoctorNetworkConfig, patientId: string) {
    return this.requestWithToken(
      network,
      'GET',
      `partner/patients/${patientId}/messages?channel=patient`,
    );
  }

  async getCase(network: DoctorNetworkConfig, caseId: string) {
    return this.requestWithToken(network, 'GET', `partner/cases/${caseId}`);
  }

  async createMessage(
    network: DoctorNetworkConfig,
    patientId: string,
    payload: Record<string, unknown>,
  ) {
    return this.requestWithToken(
      network,
      'POST',
      `partner/patients/${patientId}/messages`,
      payload,
    );
  }

  async refreshToken(network: DoctorNetworkConfig, persist = true) {
    const credentials = this.parseCredentials(network.credentials);
    const baseUrl = this.resolveBaseUrl(network);

    if (!credentials.client_id || !credentials.client_secret) {
      throw new BadRequestException('Doctor network credentials are incomplete.');
    }

    if (!this.isUuid(credentials.client_id)) {
      throw new BadRequestException(
        'Doctor network client_id must be a valid UUID.',
      );
    }

    const response = await fetch(`${baseUrl}partner/auth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        grant_type: credentials.grant_type || 'client_credentials',
        scope: credentials.scope || '',
      }),
    });

    const payload = await this.parseJson(response);

    const accessToken =
      String(this.getNestedValue(payload, ['data', 'access_token']) ?? '').trim() ||
      String(payload?.access_token ?? '').trim();

    if (!response.ok || !accessToken) {
      throw new BadRequestException(
        this.extractErrorMessage(payload, 'Unable to refresh doctor network token.'),
      );
    }

    if (persist && network.id) {
      await this.storeToken(network.id, accessToken);
    }

    return accessToken;
  }

  private async requestWithToken(
    network: DoctorNetworkConfig,
    method: 'GET' | 'POST' | 'PATCH',
    endpoint: string,
    payload?: Record<string, unknown> | FormData,
    jsonBody = true,
  ) {
    const baseUrl = this.resolveBaseUrl(network);
    let accessToken = await this.getAccessToken(network);
    let response: Response;

    try {
      response = await this.sendAuthorizedRequest(
        `${baseUrl}${endpoint}`,
        accessToken,
        method,
        payload,
        jsonBody,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : `Doctor network request failed for ${endpoint}.`,
      );
    }

    if (response.status === 401) {
      accessToken = await this.refreshToken(network, true);
      try {
        response = await this.sendAuthorizedRequest(
          `${baseUrl}${endpoint}`,
          accessToken,
          method,
          payload,
          jsonBody,
        );
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : `Doctor network request failed for ${endpoint}.`,
        );
      }
    }

    const data = await this.parseJson(response);
    if (!response.ok) {
      throw new BadRequestException(
        this.extractErrorMessage(data, `Doctor network request failed for ${endpoint}.`),
      );
    }

    return data;
  }

  private async sendAuthorizedRequest(
    url: string,
    accessToken: string,
    method: 'GET' | 'POST' | 'PATCH',
    payload?: Record<string, unknown> | FormData,
    jsonBody = true,
  ) {
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(jsonBody && method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      body:
        method === 'GET'
          ? undefined
          : payload
            ? jsonBody
              ? JSON.stringify(payload)
              : (payload as unknown as BodyInit)
            : undefined,
    });
  }

  private async getAccessToken(network: DoctorNetworkConfig) {
    if (network.id) {
      const stored = await this.getStoredToken(network.id);
      if (stored) {
        return stored;
      }
    }

    return this.refreshToken(network, true);
  }

  private async getStoredToken(networkId: number) {
    const row = await this.prisma.doctorNetworkToken.findFirst({
      where: { networkId },
      select: { accessToken: true },
      orderBy: { id: 'desc' },
    });

    const token = row?.accessToken;
    return typeof token === 'string' && token.trim() ? token : null;
  }

  private async storeToken(networkId: number, accessToken: string) {
    const existing = await this.prisma.doctorNetworkToken.findFirst({
      where: { networkId },
      select: { id: true },
      orderBy: { id: 'desc' },
    });

    if (existing?.id) {
      await this.prisma.doctorNetworkToken.update({
        where: { id: existing.id },
        data: {
          accessToken,
          updatedAt: new Date(),
        },
      });
      return;
    }

    const now = new Date();
    await this.prisma.doctorNetworkToken.create({
      data: {
        networkId,
        accessToken,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  private resolveBaseUrl(network: DoctorNetworkConfig) {
    const apiUrl = String(network.apiUrl ?? '').trim().replace(/\/+$/, '');
    const apiVersion = String(network.apiVersion ?? '')
      .trim()
      .replace(/^\/+|\/+$/g, '');

    if (!apiUrl) {
      throw new BadRequestException('Doctor network API URL is missing.');
    }

    return `${apiUrl}/${apiVersion ? `${apiVersion}/` : ''}`;
  }

  private parseCredentials(raw: string | Record<string, unknown>) {
    const parsed = this.parseMaybeNestedCredentials(raw);
    const decrypted = decryptStoredFields(parsed, [
      'client_id',
      'client_secret',
      'clientId',
      'clientSecret',
    ]);
    const clientId =
      String(decrypted.client_id ?? '').trim() ||
      String(decrypted.clientId ?? '').trim() ||
      String(process.env.MD_INTEGRATION_CLIENT_ID ?? '').trim() ||
      undefined;
    const clientSecret =
      String(decrypted.client_secret ?? '').trim() ||
      String(decrypted.clientSecret ?? '').trim() ||
      String(process.env.MD_INTEGRATION_CLIENT_SECRET ?? '').trim() ||
      undefined;

    if (clientId && this.looksLikeEncryptedPayload(clientId)) {
      throw new BadRequestException(
        'Doctor network client_id is encrypted but CONFIG_ENCRYPTION_KEY is missing or invalid. Re-save the doctor network credentials in settings or restore the encryption key.',
      );
    }

    if (clientSecret && this.looksLikeEncryptedPayload(clientSecret)) {
      throw new BadRequestException(
        'Doctor network client_secret is encrypted but CONFIG_ENCRYPTION_KEY is missing or invalid. Re-save the doctor network credentials in settings or restore the encryption key.',
      );
    }

    return {
      ...decrypted,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type:
        String(decrypted.grant_type ?? '').trim() ||
        String(process.env.MD_INTEGRATION_GRANT_TYPE ?? '').trim() ||
        'client_credentials',
      scope:
        typeof decrypted.scope === 'string' && decrypted.scope.length > 0
          ? decrypted.scope
          : String(process.env.MD_INTEGRATION_SCOPE ?? '*'),
    };
  }

  private parseMaybeNestedCredentials(raw: string | Record<string, unknown>) {
    const firstPass =
      typeof raw === 'string'
        ? safeParseDbJson<unknown>(raw, {})
        : raw && typeof raw === 'object'
          ? raw
          : {};

    if (typeof firstPass === 'string') {
      return safeParseDbJson<MdiCredentials>(firstPass, {});
    }

    return (firstPass as MdiCredentials) ?? {};
  }

  private async parseJson(response: Response) {
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as MdiApiResponse;
    } catch {
      return { raw: text };
    }
  }

  private normalizeOffering(value: Record<string, unknown>): MdiOfferingRecord {
    const product = this.asRecord(value.product);
    const metadata = value.metadata ?? value.meta_data ?? null;

    return {
      offerable_id: String(value.id ?? value.offerable_id ?? ''),
      name:
        typeof value.title === 'string'
          ? value.title
          : typeof value.name === 'string'
            ? value.name
            : null,
      quantity: Number(product.quantity ?? value.quantity ?? 0),
      days_of_supply: Number(product.days_supply ?? value.days_of_supply ?? 0),
      dispense_unit:
        typeof product.dispense_unit === 'string'
          ? product.dispense_unit
          : typeof value.dispense_unit === 'string'
            ? value.dispense_unit
            : null,
      refills: Number(product.refills ?? value.refills ?? 0),
      prescription_duration: Number(
        product.prescription_duration ?? value.prescription_duration ?? 0,
      ),
      pharmacy:
        typeof product.pharmacy_name === 'string'
          ? product.pharmacy_name
          : typeof value.pharmacy === 'string'
            ? value.pharmacy
            : null,
      meta_data: this.stringifyMetadata(metadata),
    };
  }

  private extractErrorMessage(payload: Record<string, unknown>, fallback: string) {
    return (
      (typeof payload.message === 'string' ? payload.message : null) ??
      this.extractUnknownMessage(payload.error) ??
      (typeof payload.raw === 'string' ? payload.raw : null) ??
      fallback
    );
  }

  private extractCollection(payload: MdiApiResponse): Array<Record<string, unknown>> {
    if (Array.isArray(payload)) {
      return payload.filter(this.isRecord);
    }

    if (payload.success === false) {
      return [];
    }

    if (Array.isArray(payload.data)) {
      return payload.data.filter(this.isRecord);
    }

    const nestedData = this.getNestedValue(payload, ['data', 'data']);
    if (Array.isArray(nestedData)) {
      return nestedData.filter(this.isRecord);
    }

    return [];
  }

  private getNestedValue(
    value: Record<string, unknown>,
    path: string[],
  ): unknown {
    let current: unknown = value;

    for (const segment of path) {
      if (!this.isRecord(current) || !(segment in current)) {
        return undefined;
      }
      current = current[segment];
    }

    return current;
  }

  private stringifyMetadata(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (value === null || value === undefined) {
      return null;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private extractUnknownMessage(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (this.isRecord(value)) {
      const nested = value.message;
      return typeof nested === 'string' ? nested : null;
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private looksLikeEncryptedPayload(value: string) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        iv?: unknown;
        value?: unknown;
        mac?: unknown;
      };

      return Boolean(parsed?.iv && parsed?.value && parsed?.mac);
    } catch {
      return false;
    }
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    );
  }
}
