import { Injectable, Logger } from '@nestjs/common';
import {
  AddressVerificationInput,
  AddressVerificationResult,
} from '../verification.types';

@Injectable()
export class SmartyAddressProvider {
  private readonly logger = new Logger(SmartyAddressProvider.name);
  private readonly authId = String(process.env.SMARTY_AUTH_ID ?? '').trim();
  private readonly authToken = String(process.env.SMARTY_AUTH_TOKEN ?? '').trim();
  private readonly baseUrl = String(
    process.env.SMARTY_BASE_URL ?? 'https://us-street.api.smarty.com/street-address',
  ).trim();
  private readonly timeoutMs = Number(process.env.SMARTY_TIMEOUT_MS ?? 10000);

  async validateAddress(
    input: AddressVerificationInput,
  ): Promise<AddressVerificationResult> {
    if (!this.authId || !this.authToken) {
      return {
        provider: 'bypass',
        isValid: true,
        skipped: true,
        reason: 'Smarty credentials are not configured.',
      };
    }

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('auth-id', this.authId);
      url.searchParams.set('auth-token', this.authToken);
      url.searchParams.set('street', input.address1);
      if (input.address2?.trim()) {
        url.searchParams.set('street2', input.address2.trim());
      }
      if (input.city?.trim()) {
        url.searchParams.set('city', input.city.trim());
      }
      url.searchParams.set('state', input.state);
      if (input.zipCode?.trim()) {
        url.searchParams.set('zipcode', input.zipCode.trim());
      }
      url.searchParams.set('candidates', '1');
      url.searchParams.set('match', 'strict');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        const payload = (await response.json().catch(() => null)) as
          | Array<Record<string, unknown>>
          | Record<string, unknown>
          | null;

        if (!response.ok) {
          this.logger.warn(`Smarty request failed with status ${response.status}.`);
          return {
            provider: 'smarty',
            isValid: true,
            skipped: true,
            reason: `Smarty request failed with status ${response.status}.`,
            raw: payload,
          };
        }

        const candidates = Array.isArray(payload) ? payload : [];
        if (!candidates.length) {
          return {
            provider: 'smarty',
            isValid: false,
            skipped: false,
            message: 'Shipping address could not be verified. Please review it.',
            raw: payload,
          };
        }

        const candidate = candidates[0] ?? {};
        const components =
          candidate.components && typeof candidate.components === 'object'
            ? (candidate.components as Record<string, unknown>)
            : {};

        return {
          provider: 'smarty',
          isValid: true,
          skipped: false,
          normalized: {
            address1: String(candidate.delivery_line_1 ?? input.address1 ?? '').trim() || null,
            address2: String(candidate.delivery_line_2 ?? input.address2 ?? '').trim() || null,
            city: String(components.city_name ?? input.city ?? '').trim() || null,
            state: String(components.state_abbreviation ?? input.state ?? '').trim() || null,
            zipCode: String(components.zipcode ?? input.zipCode ?? '').trim() || null,
            country: input.country?.trim() || 'US',
          },
          raw: payload,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.warn(
        `Skipping address verification because Smarty is unavailable: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        provider: 'smarty',
        isValid: true,
        skipped: true,
        reason:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Smarty request failed.',
      };
    }
  }
}
