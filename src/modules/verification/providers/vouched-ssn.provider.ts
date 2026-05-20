import { Injectable, Logger } from '@nestjs/common';
import { SsnVerificationResult } from '../verification.types';

type VouchedPrivateSsnResponse = {
  result?: {
    ssnMatch?: boolean;
  };
  errors?: Array<{
    message?: string;
  }>;
  [key: string]: unknown;
};

@Injectable()
export class VouchedSsnProvider {
  private readonly logger = new Logger(VouchedSsnProvider.name);
  private readonly apiKey = String(process.env.VOUCHED_API_KEY ?? '').trim();
  private readonly baseUrl = String(
    process.env.VOUCHED_BASE_URL ?? 'https://verify.vouched.id/api',
  )
    .trim()
    .replace(/\/+$/, '');
  private readonly timeoutMs = Number(process.env.VOUCHED_TIMEOUT_MS ?? 30000);

  async verifyLast4(input: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    ssn: string;
  }): Promise<SsnVerificationResult> {
    if (process.env.NODE_ENV !== 'production') {
      return {
        provider: 'bypass',
        isValid: true,
        skipped: true,
        reason: 'SSN verification is bypassed outside production.',
      };
    }

    if (!this.apiKey) {
      return {
        provider: 'bypass',
        isValid: true,
        skipped: true,
        reason: 'Vouched API key is not configured.',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/private-ssn/verify`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Accept: 'application/json; charset=utf-8',
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          body: JSON.stringify({
            firstName: input.firstName?.trim() || undefined,
            lastName: input.lastName?.trim() || undefined,
            phone: this.normalizePhone(input.phone),
            ssn: input.ssn,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | VouchedPrivateSsnResponse
          | null;

        if (!response.ok) {
          const message = String(payload?.errors?.[0]?.message ?? '').trim();
          this.logger.warn(
            `Vouched private SSN verification failed with status ${response.status}.`,
          );
          return {
            provider: 'vouched',
            isValid: false,
            skipped: false,
            message: message || 'SSN verification failed.',
            raw: payload,
          };
        }

        const matched = payload?.result?.ssnMatch;
        return {
          provider: 'vouched',
          isValid: matched !== false,
          skipped: false,
          message: matched === false ? 'SSN verification failed.' : undefined,
          raw: payload,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.warn(
        `Skipping SSN verification because Vouched is unavailable: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        provider: 'vouched',
        isValid: true,
        skipped: true,
        reason:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Vouched request failed.',
      };
    }
  }

  private normalizePhone(phone?: string | null) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) {
      return undefined;
    }

    if (digits.length === 10) {
      return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }

    return `+${digits}`;
  }
}
