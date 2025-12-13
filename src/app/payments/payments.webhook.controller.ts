import { BadRequestException, Body, Controller, Headers, HttpCode, Logger, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { MollieService } from './mollie.service';

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
    @Headers() headers?: Record<string, string>
  ) {
    const normalized = provider.toLowerCase();
    if (normalized !== 'mollie') {
      throw new BadRequestException('PAYMENT_PROVIDER_UNSUPPORTED');
    }
    this.logger.log('===== MOLLIE WEBHOOK RECEIVED =====');
    this.logger.debug('===== RAW HEADERS =====');
    this.logger.debug(JSON.stringify(headers ?? {}, null, 2));

    let rawBody: string;
    if (Buffer.isBuffer(body)) {
      rawBody = body.toString('utf8');
    } else if (typeof body === 'string') {
      rawBody = body;
    } else {
      rawBody = JSON.stringify(body ?? {}, null, 2);
    }
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
    return this.processMollieWebhook(
      Buffer.isBuffer(body) ? body : Buffer.from(rawBody, 'utf8'),
      signatureHeader
    );
  }

  private async processMollieWebhook(body: Buffer | Record<string, unknown> | string, signature?: string) {
    if (!this.mollieService.isEnabled()) {
      throw new BadRequestException('MOLLIE_DISABLED');
    }
    const payload = Buffer.isBuffer(body)
      ? body
      : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    const event = await this.mollieService.parseEvent(payload, signature);
    this.logger.debug('===== PARSED EVENT (RAW) =====');
    this.logger.debug(JSON.stringify(event, null, 2));
    this.logger.debug(
      `[Webhook] Parsed Mollie event ${typeof event['id'] === 'string' ? event['id'] : 'unknown'} (${
        event['type'] ?? event['resource'] ?? 'n/a'
      })`
    );
    await this.paymentsService.handleMollieEvent(event);
    return { received: true };
  }
}
