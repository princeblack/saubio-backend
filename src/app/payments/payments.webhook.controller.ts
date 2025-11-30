import { BadRequestException, Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { MollieService } from './mollie.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly mollieService: MollieService
  ) {}

  @Post('webhooks/:provider')
  @HttpCode(200)
  async handleGenericWebhook(
    @Param('provider') provider: string,
    @Body() body: Buffer | Record<string, unknown> | string,
    @Headers('x-webhook-signature') genericSignature?: string
  ) {
    const normalized = provider.toLowerCase();
    if (normalized !== 'mollie') {
      throw new BadRequestException('PAYMENT_PROVIDER_UNSUPPORTED');
    }
    return this.processMollieWebhook(body, genericSignature);
  }

  private async processMollieWebhook(body: Buffer | Record<string, unknown> | string, signature?: string) {
    if (!this.mollieService.isEnabled()) {
      throw new BadRequestException('MOLLIE_DISABLED');
    }
    const payload = Buffer.isBuffer(body)
      ? body
      : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    const event = await this.mollieService.parseEvent(payload, signature);
    await this.paymentsService.handleMollieEvent(event);
    return { received: true };
  }
}
