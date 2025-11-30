import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportModule } from './support/support.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfileModule } from './profile/profile.module';
import { AdminModule } from './admin/admin.module';
import { ProviderModule } from './provider/provider.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { PaymentsModule } from './payments/payments.module';
import { DocumentsModule } from './documents/documents.module';
import { OnfidoModule } from './onfido/onfido.module';
import { PricingModule } from './pricing/pricing.module';
import { DisputesModule } from './disputes/disputes.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    BookingsModule,
    SupportModule,
    NotificationsModule,
    ProfileModule,
    AdminModule,
    ProviderModule,
    GeocodingModule,
    PaymentsModule,
    PricingModule,
    DisputesModule,
    DocumentsModule,
    OnfidoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
