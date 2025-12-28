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

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly mollieService: MollieService
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
    try {
      processed = await this.processMollieWebhook(
        Buffer.isBuffer(body) ? body : Buffer.from(rawBody, 'utf8'),
        signatureHeader,
        rawBuffer
      );
    } catch (error) {
      this.logger.error(
        `[Webhook] Unexpected error while handling Mollie webhook: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
    }
    return { received: true, processed };
  }

  private async processMollieWebhook(
    body: Buffer | Record<string, unknown> | string,
    signature?: string,
    rawBody?: Buffer
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
      await this.paymentsService.handleMollieEvent(event);
      return true;
    } catch (error) {
      this.logger.error(
        `[Webhook] Failed to process Mollie webhook: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
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
}
