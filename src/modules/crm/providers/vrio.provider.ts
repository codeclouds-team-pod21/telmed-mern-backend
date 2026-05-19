import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { safeParseDbJson } from '../../../common/utils/json-db.util';
import {
  decryptStoredFields,
  isStoredCredentialDecryptionError,
  looksLikeStoredEncryptedPayload,
} from '../../../common/utils/encrypted-config.util';
import { CrmProvider } from '../interfaces/crm-provider.interface';

type VrioCredentials = {
  api_key?: string;
  connection_id?: string;
  crm_id?: string | number;
  apiKey?: string;
  connectionId?: string;
  crmId?: string | number;
};

type VrioOffer = {
  offer_id: string;
  order_offer_quantity: number;
};

type VrioMapping = Record<string, unknown> & {
  credentials?: unknown;
  order_api_id?: string;
  offer_id?: string;
  campaign_id?: string;
  shipping_profile_id?: number | string | null;
};

@Injectable()
export class VrioProvider implements CrmProvider {
  readonly type = 'vrio';
  private readonly baseUrl = 'https://api.vrio.app';
  private readonly logger = new Logger(VrioProvider.name);

  async createPartialOrder(
    data: Record<string, unknown>,
    mapping: Record<string, unknown>,
  ): Promise<unknown> {
    const resolved = mapping as VrioMapping;
    const credentials = this.parseCredentials(resolved.credentials);
    const payload = {
      connection_id: credentials.connection_id ?? null,
      campaign_id: resolved.campaign_id ?? null,
      customer_id: data.crm_customer_id ?? null,
      first_name: String(data.first_name ?? ''),
      last_name: String(data.last_name ?? ''),
      email: String(data.email ?? ''),
      phone: this.normalizePhone(data.phone),
      offers: this.buildOffers(data, resolved),
    };

    return this.request('/orders', credentials, {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Unable to create partial CRM order.',
    });
  }

  async createOrder(
    data: Record<string, unknown>,
    mapping: Record<string, unknown>,
  ): Promise<unknown> {
    const resolved = mapping as VrioMapping;
    const credentials = this.parseCredentials(resolved.credentials);
    const orderId = String(resolved.order_api_id ?? '');

    if (!orderId) {
      throw new BadRequestException('CRM order id is required before authorization.');
    }

    const payload = {
      action: 'authorize',
      connection_id: credentials.connection_id ?? null,
      campaign_id: resolved.campaign_id ?? null,
      customer_id: data.crm_customer_id ?? null,
      first_name: String(data.first_name ?? ''),
      last_name: String(data.last_name ?? ''),
      email: String(data.email ?? ''),
      phone: this.normalizePhone(data.phone),
      same_address: Boolean(data.same_address),
      bill_fname: String(data.bill_fname ?? ''),
      bill_lname: String(data.bill_lname ?? ''),
      bill_address1: String(data.bill_address1 ?? ''),
      bill_address2: String(data.bill_address2 ?? ''),
      bill_city: String(data.bill_city ?? ''),
      bill_state: String(data.bill_state ?? ''),
      bill_zipcode: String(data.bill_zipcode ?? ''),
      bill_country: String(data.bill_country ?? 'US'),
      ship_fname: String(data.ship_fname ?? ''),
      ship_lname: String(data.ship_lname ?? ''),
      ship_address1: String(data.ship_address1 ?? ''),
      ship_address2: String(data.ship_address2 ?? ''),
      ship_city: String(data.ship_city ?? ''),
      ship_state: String(data.ship_state ?? ''),
      ship_zipcode: String(data.ship_zipcode ?? ''),
      ship_country: String(data.ship_country ?? 'US'),
      customers_address_billing_id:
        data.customers_address_billing_id ?? null,
      customers_address_shipping_id:
        data.customers_address_shipping_id ?? null,
      shipping_profile_id: resolved.shipping_profile_id ?? null,
      offers: this.buildOffers(data, resolved),
      payment_method_id: 1,
      card_type_id: this.detectCardType(String(data.card_number ?? '')),
      card_number: this.normalizeCardNumber(data.card_number),
      card_exp_month: String(data.card_exp_month ?? ''),
      card_exp_year: String(data.card_exp_year ?? ''),
      card_cvv: String(data.card_cvv ?? ''),
      order_id: orderId,
      offers_restrict: true,
    };

    this.logger.debug(
      `VRIO authorize payload: ${JSON.stringify(this.sanitizePayload(payload))}`,
    );

    return this.request(`/orders/${orderId}/authorize`, credentials, {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Unable to authorize CRM order.',
    });
  }

  async createSwapAuthorizeOrder(
    data: Record<string, unknown>,
    mapping: Record<string, unknown>,
  ): Promise<unknown> {
    const resolved = mapping as VrioMapping;
    const credentials = this.parseCredentials(resolved.credentials);
    const payload = {
      connection_id: resolved.connection_id ?? credentials.connection_id ?? null,
      campaign_id: resolved.campaign_id ?? null,
      offers: this.buildOffers(data, resolved),
      action: 'authorize',
      payment_method_id: data.payment_method_id ?? null,
      customer_id: data.crm_customer_id ?? null,
      customer_card_id: data.customer_card_id ?? null,
      card_type_id: data.card_type_id ?? null,
      offers_restrict: true,
      same_address: true,
      customers_address_billing_id: data.customers_address_billing_id ?? null,
      customers_address_shipping_id: data.customers_address_shipping_id ?? null,
      total: data.total ?? null,
      shipping_price: data.shipping_price ?? null,
    };

    return this.request('/orders', credentials, {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Unable to authorize swap CRM order.',
    });
  }

  async captureOrder(
    orderId: string,
    mapping: Record<string, unknown>,
  ): Promise<unknown> {
    const resolved = mapping as VrioMapping;
    const credentials = this.parseCredentials(resolved.credentials);

    return this.request(`/orders/${orderId}/capture`, credentials, {
      method: 'POST',
      body: {},
      fallbackMessage: 'Unable to capture CRM order.',
    });
  }

  async cancelOrder(orderOfferId: string, credentials: unknown): Promise<unknown> {
    return this.request(
      `/order_offers/${orderOfferId}/cancel`,
      this.parseCredentials(credentials),
      {
        method: 'POST',
        body: {
          cancel_type_id: 1,
        },
        fallbackMessage: 'Unable to cancel CRM order.',
      },
    );
  }

  async refundOrder(
    transactionId: string,
    refundAmount: string | number,
    credentials: unknown,
  ): Promise<unknown> {
    return this.request(
      `/transactions/${transactionId}/refund`,
      this.parseCredentials(credentials),
      {
        method: 'POST',
        body: {
          refund_amount: refundAmount,
        },
        fallbackMessage: 'Unable to refund CRM order.',
      },
    );
  }

  async checkOrderOffer(): Promise<unknown> {
    throw new Error('VRIO offer eligibility is not wired yet.');
  }

  async validateCoupon(): Promise<unknown> {
    throw new Error('VRIO coupon validation is not wired yet.');
  }

  async calculateDiscount(): Promise<unknown> {
    throw new Error('VRIO discount calculation is not wired yet.');
  }

  async getCrmData(credentials: unknown): Promise<unknown> {
    const parsedCredentials = this.parseCredentials(credentials);
    const campaignsPayload = await this.request(
      '/campaigns?with=offers,shipping_profiles',
      parsedCredentials,
      {
        method: 'GET',
        fallbackMessage: 'Unable to fetch CRM campaigns.',
      },
    );

    const campaigns = Array.isArray(campaignsPayload?.campaigns)
      ? campaignsPayload.campaigns
      : Array.isArray(campaignsPayload?.data?.campaigns)
        ? campaignsPayload.data.campaigns
        : [];

    const normalizedCampaigns = campaigns.map((campaign: Record<string, any>) => ({
      campaign_id: String(campaign?.campaign_id ?? ''),
      campaign_name: String(campaign?.campaign_name ?? ''),
      offers: Array.isArray(campaign?.offers)
        ? campaign.offers.map((offer: Record<string, any>) => ({
            offer_id: String(offer?.offer_id ?? ''),
            offer_name: String(offer?.offer_name ?? ''),
            offer_price: offer?.offer_price ?? 0,
          }))
        : [],
      shipping_profiles: Array.isArray(campaign?.shipping_profiles)
        ? campaign.shipping_profiles.map((shippingProfile: Record<string, any>) => ({
            shipping_profile_id: Number(shippingProfile?.shipping_profile_id ?? 0),
            shipping_profile_name: String(
              shippingProfile?.shipping_profile_name ?? '',
            ),
            shipping_price:
              shippingProfile?.shipping_profile_configs?.[0]
                ?.shipping_profile_config_price ??
              shippingProfile?.shipping_price ??
              0,
          }))
        : [],
    }));

    const coupons = await this.getCrmCoupons(parsedCredentials);

    return {
      success: true,
      message: normalizedCampaigns.length
        ? 'CRM campaigns fetched.'
        : 'No campaigns returned.',
      data: {
        campaigns: normalizedCampaigns,
        coupons,
      },
    };
  }

  async getOrderDetails(orderId: string, credentials: unknown): Promise<unknown> {
    return this.request(
      `/orders/${orderId}?with=order_offers,shipments,transactions,customer,customer_card,customer_address_billing,customer_address_shipping`,
      this.parseCredentials(credentials),
      {
        method: 'GET',
        fallbackMessage: 'Unable to fetch CRM order details.',
      },
    );
  }

  async getCustomerCards(customerId: string, credentials: unknown): Promise<unknown> {
    return this.request(
      `/customers/${customerId}?with=customer_cards`,
      this.parseCredentials(credentials),
      {
        method: 'GET',
        fallbackMessage: 'Unable to fetch CRM customer cards.',
      },
    );
  }

  async updateOrder(
    orderId: string,
    _variantId: number | null,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const credentials = this.parseCredentials(payload.credentials);
    const body = { ...payload };
    delete body.credentials;

    return this.request(`/orders/${orderId}`, credentials, {
      method: 'PATCH',
      body,
      fallbackMessage: 'Unable to update CRM order.',
    });
  }

  private parseCredentials(input: unknown): VrioCredentials {
    const parsed = this.parseMaybeNestedCredentials(input);
    let decrypted: VrioCredentials;

    try {
      decrypted = decryptStoredFields(parsed, ['api_key', 'apiKey']);
    } catch (error) {
      const encryptedApiKey = this.resolveCredentialValue(parsed, ['api_key', 'apiKey']);
      if (
        isStoredCredentialDecryptionError(error) &&
        looksLikeStoredEncryptedPayload(encryptedApiKey)
      ) {
        throw new BadRequestException(
          'CRM API key could not be decrypted. CONFIG_ENCRYPTION_KEY does not match the key used when the credential was saved. Re-save the CRM API key in settings or restore the original encryption key.',
        );
      }

      throw error;
    }

    const resolvedApiKey = this.resolveCredentialValue(decrypted, ['api_key', 'apiKey']);
    const resolvedConnectionId = this.resolveCredentialValue(decrypted, [
      'connection_id',
      'connectionId',
    ]);
    const resolvedCrmId =
      decrypted.crm_id ??
      decrypted.crmId ??
      (String(process.env.CRM_ID ?? '').trim() || undefined);

    if (this.looksLikeEncryptedPayload(resolvedApiKey)) {
      throw new BadRequestException(
        'CRM API key is encrypted but CONFIG_ENCRYPTION_KEY is missing or invalid. Re-save the CRM API key in settings or restore the encryption key.',
      );
    }

    return {
      ...decrypted,
      api_key:
        resolvedApiKey ||
        String(process.env.VRIO_API_KEY ?? '').trim() ||
        String(process.env.VIRO_API_KEY ?? '').trim() ||
        String(process.env.CRM_API_KEY ?? '').trim() ||
        undefined,
      connection_id:
        resolvedConnectionId ||
        String(process.env.VRIO_CONNECTION_ID ?? '').trim() ||
        String(process.env.VIRO_CONNECTION_ID ?? '').trim() ||
        String(process.env.CRM_CONNECTION_ID ?? '').trim() ||
        undefined,
      connectionId: resolvedConnectionId,
      apiKey: resolvedApiKey,
      crm_id: resolvedCrmId,
      crmId: resolvedCrmId,
    };
  }

  private parseMaybeNestedCredentials(input: unknown) {
    const firstPass =
      typeof input === 'string'
        ? safeParseDbJson<unknown>(input, {})
        : input && typeof input === 'object'
          ? input
          : {};

    if (typeof firstPass === 'string') {
      return safeParseDbJson<VrioCredentials>(firstPass, {});
    }

    return (firstPass as VrioCredentials) ?? {};
  }

  private resolveCredentialValue(
    credentials: VrioCredentials,
    keys: Array<keyof VrioCredentials>,
  ) {
    for (const key of keys) {
      const value = String(credentials[key] ?? '').trim();
      if (value) {
        return value;
      }
    }

    return '';
  }

  private looksLikeEncryptedPayload(value: string) {
    return looksLikeStoredEncryptedPayload(value);
  }

  private buildOffers(
    data: Record<string, unknown>,
    mapping: VrioMapping,
  ): VrioOffer[] {
    const offerId = String(
      data.offer_id ?? mapping.offer_id ?? '',
    ).trim();

    if (!offerId) {
      throw new BadRequestException('CRM offer mapping is missing.');
    }

    return [{ offer_id: offerId, order_offer_quantity: 1 }];
  }

  private normalizeCardNumber(value: unknown) {
    return String(value ?? '').replace(/\D+/g, '');
  }

  private normalizePhone(value: unknown) {
    return String(value ?? '').replace(/\D+/g, '');
  }

  private detectCardType(number: string): number | null {
    const normalized = number.replace(/\D+/g, '');

    if (/^(5[1-5][0-9]{14}|2(2[2-9][0-9]{2}|[3-6][0-9]{3}|7([01][0-9]{2}|20))[0-9]{10})$/.test(normalized)) {
      return 1;
    }
    if (/^4[0-9]{12}(?:[0-9]{3})?$/.test(normalized)) {
      return 2;
    }
    if (/^(6011|65|64[4-9])[0-9]{12,15}$/.test(normalized)) {
      return 3;
    }
    if (/^3[47][0-9]{13}$/.test(normalized)) {
      return 4;
    }

    return null;
  }

  private async request(
    path: string,
    credentials: VrioCredentials,
    options: {
      method: 'GET' | 'POST' | 'PATCH';
      body?: Record<string, unknown>;
      fallbackMessage: string;
    },
  ) {
    if (!credentials.api_key) {
      throw new BadRequestException('CRM API key is missing.');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': credentials.api_key,
      },
      body:
        options.method === 'GET'
          ? undefined
          : JSON.stringify(options.body ?? {}),
    });

    const text = await response.text();
    const parsed = text ? this.tryParseJson(text) : {};

    this.logger.debug(
      `VRIO response ${options.method} ${path}: ${JSON.stringify(this.sanitizePayload(parsed))}`,
    );

    if (!response.ok || parsed.success === false) {
      throw new BadRequestException(
        this.extractErrorMessage(parsed, options.fallbackMessage),
      );
    }

    return parsed;
  }

  private async getCrmCoupons(credentials: VrioCredentials) {
    const payload = await this.request(
      '/discounts?discount_active=true&with=discount_offers',
      credentials,
      {
        method: 'GET',
        fallbackMessage: 'Unable to fetch CRM coupons.',
      },
    );

    const discounts = Array.isArray(payload?.discounts)
      ? payload.discounts
      : Array.isArray(payload?.data?.discounts)
        ? payload.data.discounts
        : [];

    const coupons = [] as Array<{
      discount_id: string;
      discount_code: string;
      offer_id: string;
    }>;

    for (const coupon of discounts) {
      const offers = Array.isArray(coupon?.discount_offers)
        ? coupon.discount_offers
        : [];

      for (const discountOffer of offers) {
        coupons.push({
          discount_id: String(coupon?.discount_id ?? ''),
          discount_code: String(coupon?.discount_code ?? ''),
          offer_id: String(discountOffer?.offer_id ?? ''),
        });
      }
    }

    return coupons;
  }

  private tryParseJson(text: string): Record<string, any> {
    try {
      return JSON.parse(text) as Record<string, any>;
    } catch {
      return { raw: text };
    }
  }

  private extractErrorMessage(payload: Record<string, any>, fallback: string) {
    const candidates = [
      payload?.message,
      payload?.error?.message,
      payload?.error,
      payload?.details?.message,
      Array.isArray(payload?.details?.errors)
        ? payload.details.errors.join(', ')
        : null,
      Array.isArray(payload?.error?.errors)
        ? payload.error.errors.join(', ')
        : null,
      typeof payload?.details === 'string' ? payload.details : null,
      Array.isArray(payload?.errors) ? payload.errors.join(', ') : null,
      typeof payload?.raw === 'string' ? payload.raw : null,
    ];

    return candidates.find(
      (candidate) => typeof candidate === 'string' && candidate.trim().length > 0,
    ) ?? fallback;
  }

  private sanitizePayload<T>(payload: T): T {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.sanitizePayload(item)) as T;
    }

    const clone = { ...(payload as Record<string, unknown>) };

    if ('card_number' in clone) {
      const last4 = String(clone.card_number ?? '').replace(/\D+/g, '').slice(-4);
      clone.card_number = last4 ? `****${last4}` : '';
    }

    if ('card_cvv' in clone) {
      clone.card_cvv = '***';
    }

    for (const [key, value] of Object.entries(clone)) {
      if (value && typeof value === 'object') {
        clone[key] = this.sanitizePayload(value);
      }
    }

    return clone as T;
  }
}
