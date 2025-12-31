import { Module, forwardRef } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments.webhook.controller';
import { InvoiceModule } from './invoice/invoice.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MollieService } from './mollie.service';
import { PricingModule } from '../pricing/pricing.module';
import { BookingsModule } from '../bookings/bookings.module';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    InvoiceModule,
    NotificationsModule,
    PricingModule,
    forwardRef(() => BookingsModule),
    SystemModule,
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, MollieService],
  exports: [PaymentsService, MollieService],
})
export class PaymentsModule {}
