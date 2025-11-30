import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  async parseEvent(payload: Buffer | string | object, signature?: string): Promise<Record<string, unknown>> {
    if (this.webhookToken && signature && signature !== this.webhookToken) {
      throw new Error('MOLLIE_SIGNATURE_INVALID');
    }
    const data = this.normalizePayload(payload);
    try {
      return typeof data === 'string' ? (JSON.parse(data) as Record<string, unknown>) : data;
    } catch (error) {
      this.logger.warn(`Unable to parse Mollie webhook payload: ${error instanceof Error ? error.message : error}`);
      return {};
    }
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
