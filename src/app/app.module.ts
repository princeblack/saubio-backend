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
import { EmployeeModule } from './employee/employee.module';
import { ProviderModule } from './provider/provider.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { PaymentsModule } from './payments/payments.module';
import { DocumentsModule } from './documents/documents.module';
import { OnfidoModule } from './onfido/onfido.module';
import { PricingModule } from './pricing/pricing.module';
import { DisputesModule } from './disputes/disputes.module';
import { FollowUpModule } from './follow-up/follow-up.module';
import { IdentityModule } from './identity/identity.module';
import { ComplianceModule } from './compliance/compliance.module';
import { SecurityModule } from './security/security.module';

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
    EmployeeModule,
    ProviderModule,
    GeocodingModule,
    PaymentsModule,
    PricingModule,
    DisputesModule,
    DocumentsModule,
    OnfidoModule,
    FollowUpModule,
    IdentityModule,
    ComplianceModule,
    SecurityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
