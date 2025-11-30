import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OnfidoService } from './onfido.service';

@ApiTags('onfido')
@Controller('onfido')
export class OnfidoWebhookController {
  constructor(private readonly onfidoService: OnfidoService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() _req: Request,
    @Body() body: Buffer,
    @Headers('x-signature') signature?: string
  ) {
    await this.onfidoService.handleWebhook(body, signature);
    return { received: true };
  }
}
