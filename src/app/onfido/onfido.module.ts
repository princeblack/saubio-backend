import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { OnfidoService } from './onfido.service';
import { OnfidoWebhookController } from './onfido-webhook.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [OnfidoService],
  controllers: [OnfidoWebhookController],
  exports: [OnfidoService],
})
export class OnfidoModule {}
