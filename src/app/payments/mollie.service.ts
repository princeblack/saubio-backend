import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { URLSearchParams } from 'url';
import createMollieClient from '@mollie/api-client';
import type { Customer, Mandate, Payment } from '@mollie/api-client';
import type { AppEnvironmentConfig } from '../config/configuration';

type MollieClient = ReturnType<typeof createMollieClient>;
type CreatePaymentParameters = Parameters<MollieClient['payments']['create']>[0];
type CreateCustomerParameters = Parameters<MollieClient['customers']['create']>[0];
type MandateCreateParameters = Parameters<MollieClient['customerMandates']['create']>[0];
type MandateCreatePayload = Omit<MandateCreateParameters, 'customerId'>;

@Injectable()
export class MollieService {
  private readonly logger = new Logger(MollieService.name);
  private readonly apiKey?: string;
  private readonly webhookToken?: string;
  private readonly mollieClient?: MollieClient;

  constructor(configService: ConfigService<AppEnvironmentConfig>) {
    this.apiKey = configService.get('app.mollieApiKey' as keyof AppEnvironmentConfig);
    this.webhookToken = configService.get('app.mollieWebhookToken' as keyof AppEnvironmentConfig);
    if (this.apiKey) {
      this.mollieClient = createMollieClient({ apiKey: this.apiKey });
    } else {
      this.logger.warn('MOLLIE_API_KEY is not configured. Mollie payments are disabled.');
    }
  }

  isEnabled(): boolean {
    return Boolean(this.mollieClient);
  }

  get webhookSignatureToken(): string | undefined {
    return this.webhookToken;
  }

  async createPayment(params: CreatePaymentParameters): Promise<Payment> {
    const client = this.requireClient();
    return client.payments.create(params) as unknown as Promise<Payment>;
  }

  async createCustomer(params: CreateCustomerParameters): Promise<Customer> {
    const client = this.requireClient();
    return client.customers.create(params) as unknown as Promise<Customer>;
  }

  async createMandate(customerId: string, params: MandateCreatePayload): Promise<Mandate> {
    const client = this.requireClient();
    return client.customerMandates.create({ ...params, customerId }) as unknown as Promise<Mandate>;
  }

  async getMandate(customerId: string, mandateId: string): Promise<Mandate> {
    const client = this.requireClient();
    return client.customerMandates.get(mandateId, { customerId }) as unknown as Promise<Mandate>;
  }

  async getPayment(paymentId: string): Promise<Payment> {
    const client = this.requireClient();
    return client.payments.get(paymentId) as unknown as Promise<Payment>;
  }

  async parseEvent(
    payload: Buffer | string | object,
    signature?: string,
    rawBody?: Buffer
  ): Promise<Record<string, unknown>> {
    const normalizedPayload = this.normalizePayload(payload);
    const event = this.parsePayload(normalizedPayload);

    if (!this.webhookToken) {
      return event;
    }

    const normalizedSignature = signature?.trim();
    if (normalizedSignature?.toLowerCase() === 'dummy signature') {
      this.logger.warn(
        'Received Mollie webhook with dummy signature. Assuming dashboard connectivity test and accepting payload without verification.'
      );
      return event;
    }
    const bufferToValidate = rawBody ?? this.normalizeBuffer(payload);
    let signatureValidated = false;

    if (normalizedSignature) {
      if (normalizedSignature.startsWith('sha256=')) {
        if (this.verifySignature(normalizedSignature, bufferToValidate)) {
          signatureValidated = true;
        } else {
          this.logger.warn(
            'Mollie webhook signature mismatch for sha256 header. Continuing with downstream API verification.'
          );
        }
      } else if (normalizedSignature === this.webhookToken) {
        signatureValidated = true;
      } else {
        this.logger.warn('Mollie webhook signature header did not match any known validation scheme.');
      }
    } else {
      this.logger.warn('Mollie webhook received without signature header. Falling back to API verification only.');
    }

    if (!signatureValidated && this.matchesLegacyWebhookToken(event)) {
      signatureValidated = true;
    }

    if (!signatureValidated) {
      this.logger.warn('Mollie webhook could not be verified via signature. Proceeding with payment lookup.');
    }

    return event;
  }

  private verifySignature(signature: string, payload: Buffer): boolean {
    if (!this.webhookToken) {
      return true;
    }
    try {
      const trimmed = signature.trim();
      const provided = trimmed.startsWith('sha256=') ? trimmed : `sha256=${trimmed}`;
      const expectedHash = createHmac('sha256', this.webhookToken).update(payload).digest('hex');
      const expectedSignature = `sha256=${expectedHash}`;
      const providedBuffer = Buffer.from(provided, 'utf8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      if (providedBuffer.length !== expectedBuffer.length) {
        return false;
      }
      return timingSafeEqual(providedBuffer, expectedBuffer);
    } catch (error) {
      this.logger.warn(
        `Unable to verify Mollie signature: ${error instanceof Error ? error.message : error}`
      );
      return false;
    }
  }

  private normalizeBuffer(payload: Buffer | string | object): Buffer {
    if (Buffer.isBuffer(payload)) {
      return payload;
    }
    if (typeof payload === 'string') {
      return Buffer.from(payload, 'utf8');
    }
    return Buffer.from(JSON.stringify(payload ?? {}));
  }

  private parsePayload(raw: string | Record<string, unknown>): Record<string, unknown> {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed.length) {
        return {};
      }
      try {
        return JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        const formPayload = this.tryParseFormPayload(trimmed);
        if (formPayload) {
          return formPayload;
        }
        this.logger.warn('Unable to parse Mollie webhook payload as JSON or form data.');
        return {};
      }
    }
    return raw;
  }

  private tryParseFormPayload(value: string): Record<string, unknown> | null {
    if (!value.includes('=')) {
      return null;
    }
    try {
      const params = new URLSearchParams(value);
      const result: Record<string, unknown> = {};
      let hasEntries = false;
      params.forEach((paramValue, key) => {
        if (key) {
          hasEntries = true;
          result[key] = paramValue;
        }
      });
      return hasEntries ? result : null;
    } catch {
      return null;
    }
  }

  private matchesLegacyWebhookToken(payload: Record<string, unknown>): boolean {
    if (!this.webhookToken || !payload || typeof payload !== 'object') {
      return false;
    }
    const entityId =
      typeof payload['entityId'] === 'string'
        ? payload['entityId']
        : typeof payload['entityID'] === 'string'
        ? payload['entityID']
        : undefined;
    if (entityId && entityId === this.webhookToken) {
      this.logger.warn(
        'Accepted Mollie webhook using entityId/token comparison. Configure MOLLIE_WEBHOOK_TOKEN with the Signing secret from the Mollie dashboard to enable HMAC verification.'
      );
      return true;
    }
    return false;
  }

  private normalizePayload(payload: Buffer | string | object): string | Record<string, unknown> {
    if (Buffer.isBuffer(payload)) {
      return payload.toString('utf8');
    }
    if (typeof payload === 'string') {
      return payload;
    }
    return payload as Record<string, unknown>;
  }

  private requireClient(): MollieClient {
    if (!this.mollieClient) {
      throw new Error('Mollie client is not configured. Set MOLLIE_API_KEY to enable payments.');
    }
    return this.mollieClient;
  }
}
