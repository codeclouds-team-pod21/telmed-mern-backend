import { Injectable, Logger } from '@nestjs/common';
import { EmailVerificationResult } from '../verification.types';

@Injectable()
export class XVerifyEmailProvider {
  private readonly logger = new Logger(XVerifyEmailProvider.name);
  private readonly apiKey = String(process.env.XVERIFY_API_KEY ?? '').trim();
  private readonly baseUrl = String(
    process.env.XVERIFY_BASE_URL ?? 'https://api.xverify.com/v2/ev',
  ).trim();
  private readonly timeoutMs = Number(process.env.XVERIFY_TIMEOUT_MS ?? 10000);

  async verifyEmail(email: string): Promise<EmailVerificationResult> {
    if (!this.apiKey) {
      return {
        provider: 'bypass',
        isValid: true,
        skipped: true,
        reason: 'XVerify API key is not configured.',
      };
    }

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('email', email);
      url.searchParams.set('apikey', this.apiKey);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const payload = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;

        if (!response.ok) {
          this.logger.warn(`XVerify request failed with status ${response.status}.`);
          return {
            provider: 'xverify',
            isValid: true,
            skipped: true,
            reason: `XVerify request failed with status ${response.status}.`,
            raw: payload,
          };
        }

        const status = String(
          payload?.status ?? payload?.result ?? payload?.response_code ?? '',
        )
          .trim()
          .toLowerCase();
        const message = String(
          payload?.message ?? payload?.reason ?? payload?.description ?? '',
        ).trim();
        const definitelyInvalid =
          status === 'invalid' ||
          status === 'rejected' ||
          status === 'deny' ||
          status === 'denied';

        return {
          provider: 'xverify',
          isValid: !definitelyInvalid,
          skipped: false,
          message: definitelyInvalid
            ? message || 'Please enter a valid email address.'
            : undefined,
          raw: payload,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.warn(
        `Skipping email verification because XVerify is unavailable: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        provider: 'xverify',
        isValid: true,
        skipped: true,
        reason:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'XVerify request failed.',
      };
    }
  }
}
