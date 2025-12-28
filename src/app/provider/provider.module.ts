import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProviderController } from './provider.controller';
import { ProviderService } from './provider.service';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProviderDirectoryController } from './provider-directory.controller';
import { ProviderCitiesController } from './provider-cities.controller';
import { ProviderCoverageController } from './provider-coverage.controller';
import { SmsService } from './sms.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GeocodingModule } from '../geocoding/geocoding.module';

@Module({
  imports: [AuthModule, BookingsModule, PaymentsModule, NotificationsModule, GeocodingModule],
  controllers: [ProviderController, ProviderDirectoryController, ProviderCitiesController, ProviderCoverageController],
  providers: [ProviderService, SmsService],
})
export class ProviderModule {}
