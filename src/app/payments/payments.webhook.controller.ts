import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { MollieService } from './mollie.service';
import { SystemObservabilityService } from '../system/system-observability.service';
import { Prisma, WebhookDeliveryStatus as PrismaWebhookDeliveryStatus } from '@prisma/client';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly mollieService: MollieService,
    private readonly observability: SystemObservabilityService
  ) {}

  @Post('webhooks/:provider')
  @HttpCode(200)
  async handleGenericWebhook(
    @Param('provider') provider: string,
    @Body() body: Buffer | Record<string, unknown> | string,
    @Headers() headers?: Record<string, string>,
    @Req() req?: RawBodyRequest
  ) {
    const normalized = provider.toLowerCase();
    if (normalized !== 'mollie') {
      throw new BadRequestException('PAYMENT_PROVIDER_UNSUPPORTED');
    }
    this.logger.log('===== MOLLIE WEBHOOK RECEIVED =====');
    this.logger.debug('===== RAW HEADERS =====');
    this.logger.debug(JSON.stringify(headers ?? {}, null, 2));

    const rawBuffer = this.resolveRawBody(req, body);
    const rawBody = rawBuffer.toString('utf8');
    this.logger.debug('===== RAW BODY =====');
    this.logger.debug(rawBody);

    const signatureHeader =
      headers?.['x-webhook-signature'] ??
      headers?.['x-mollie-signature'] ??
      headers?.['X-Mollie-Signature'];
    this.logger.log(
      `[Webhook] Incoming payload for provider=${normalized} signature=${signatureHeader ? 'present' : 'missing'}`
    );
    this.logger.debug(
      `[Webhook] Headers received: ${Object.keys(headers ?? {})
        .map((key) => key.toLowerCase())
        .join(', ')}`
    );
    let processed = false;
    let webhookLog:
      | (Awaited<ReturnType<SystemObservabilityService['recordWebhookEvent']>>)
      | null
      | undefined;
    try {
      webhookLog = await this.observability.recordWebhookEvent({
        provider: normalized,
        rawEventId: this.extractEventIdFromPayload(rawBody),
        headers: this.normalizeHeaders(headers),
        payload: this.parsePayload(rawBody),
        requestUrl: req?.originalUrl ?? req?.url ?? null,
      });
      processed = await this.processMollieWebhook(
        Buffer.isBuffer(body) ? body : Buffer.from(rawBody, 'utf8'),
        signatureHeader,
        rawBuffer,
        webhookLog?.id
      );
    } catch (error) {
      this.logger.error(
        `[Webhook] Unexpected error while handling Mollie webhook: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
      if (webhookLog?.id) {
        await this.observability.updateWebhookEvent(webhookLog.id, {
          status: PrismaWebhookDeliveryStatus.FAILED,
          processedAt: new Date(),
          processingLatencyMs: this.computeLatency(webhookLog.receivedAt),
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (webhookLog?.id && processed) {
      await this.observability.updateWebhookEvent(webhookLog.id, {
        status: PrismaWebhookDeliveryStatus.PROCESSED,
        processedAt: new Date(),
        processingLatencyMs: this.computeLatency(webhookLog.receivedAt),
      });
    }
    return { received: true, processed };
  }

  private async processMollieWebhook(
    body: Buffer | Record<string, unknown> | string,
    signature?: string,
    rawBody?: Buffer,
    webhookLogId?: string
  ): Promise<boolean> {
    if (!this.mollieService.isEnabled()) {
      this.logger.warn('[Webhook] Mollie service is disabled. Ignoring webhook payload.');
      return false;
    }
    try {
      const payload = Buffer.isBuffer(body)
        ? body
        : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}));
      const event = await this.mollieService.parseEvent(payload, signature, rawBody ?? payload);
      this.logger.debug('===== PARSED EVENT (RAW) =====');
      this.logger.debug(JSON.stringify(event, null, 2));
      const eventId = typeof event['id'] === 'string' ? event['id'] : 'unknown';
      this.logger.debug(
        `[Webhook] Parsed Mollie event ${eventId} (${event['type'] ?? event['resource'] ?? 'n/a'})`
      );
      this.logger.log(`[Webhook] Forwarding Mollie event id=${eventId} to PaymentsService`);
      if (webhookLogId) {
        await this.observability.updateWebhookEvent(webhookLogId, {
          status: PrismaWebhookDeliveryStatus.PROCESSING,
          eventId: typeof event['id'] === 'string' ? (event['id'] as string) : undefined,
          eventType: typeof event['type'] === 'string' ? (event['type'] as string) : undefined,
          resourceId: typeof event['resource'] === 'string' ? (event['resource'] as string) : undefined,
          signatureValid: Boolean(signature),
          payload: event as Prisma.InputJsonValue,
        });
      }
      const result = await this.paymentsService.handleMollieEvent(event);
      if (webhookLogId && result) {
        await this.observability.updateWebhookEvent(webhookLogId, {
          paymentId: result.paymentId ?? undefined,
          bookingId: result.bookingId ?? undefined,
          providerProfileId: result.providerProfileId ?? undefined,
          userId: result.userId ?? undefined,
          metadata: result.metadata as Prisma.InputJsonValue | undefined,
        });
      }
      return true;
    } catch (error) {
      this.logger.error(
        `[Webhook] Failed to process Mollie webhook: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
      if (webhookLogId) {
        await this.observability.updateWebhookEvent(webhookLogId, {
          status: PrismaWebhookDeliveryStatus.FAILED,
          processedAt: new Date(),
          processingLatencyMs: undefined,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    }
  }

  private resolveRawBody(
    req: RawBodyRequest | undefined,
    body: Buffer | Record<string, unknown> | string
  ): Buffer {
    if (req?.rawBody && Buffer.isBuffer(req.rawBody)) {
      return req.rawBody;
    }
    if (Buffer.isBuffer(body)) {
      return body;
    }
    if (typeof body === 'string') {
      return Buffer.from(body, 'utf8');
    }
    return Buffer.from(JSON.stringify(body ?? {}));
  }

  private parsePayload(rawBody: string) {
    try {
      return JSON.parse(rawBody);
    } catch {
      const params = new URLSearchParams(rawBody);
      if (params.has('id')) {
        return { id: params.get('id') };
      }
      return { raw: rawBody };
    }
  }

  private extractEventIdFromPayload(rawBody: string) {
    try {
      const parsed = JSON.parse(rawBody);
      if (typeof parsed === 'object' && parsed && typeof parsed['id'] === 'string') {
        return parsed['id'] as string;
      }
    } catch {
      const params = new URLSearchParams(rawBody);
      if (params.has('id')) {
        return params.get('id') ?? undefined;
      }
    }
    return undefined;
  }

  private normalizeHeaders(headers?: Record<string, string>) {
    if (!headers) {
      return undefined;
    }
    const normalized: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  private computeLatency(receivedAt: Date) {
    return Math.max(0, Date.now() - new Date(receivedAt).getTime());
  }
}
