import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeeDashboardController } from './dashboard.controller';
import { EmployeeDashboardService } from './dashboard.service';
import { EmployeeUsersController } from './users.controller';
import { EmployeeSupportController } from './support.controller';
import { EmployeeSupportCenterController } from './support-center.controller';
import { EmployeeTicketsController } from './tickets.controller';
import { EmployeeOperationsController } from './operations.controller';
import { EmployeeOperationsService } from './operations.service';
import { EmployeeProviderRequestsController } from './provider-requests.controller';
import { ProviderOnboardingModule } from '../provider-onboarding/provider-onboarding.module';
import { EmployeeProviderIdentityController } from './provider-identity.controller';
import { EmployeeProviderIdentityService } from './provider-identity.service';
import { EmployeeProviderTeamsController } from './provider-teams.controller';
import { EmployeeProviderTeamsService } from './provider-teams.service';
import { EmployeeUsersService } from './users.service';
import { BookingsModule } from '../bookings/bookings.module';
import { DisputesModule } from '../disputes/disputes.module';
import { EmployeeDisputesController } from './disputes.controller';
import { EmployeeBookingsController } from './bookings.controller';
import { EmployeeBookingsService } from './bookings.service';
import { EmployeeFinanceController } from './finance.controller';
import { EmployeeFinanceService } from './finance.service';
import { EmployeeServicesController } from './services.controller';
import { EmployeeServicesService } from './services.service';
import { PricingModule } from '../pricing/pricing.module';
import { EmployeeZonesController } from './zones.controller';
import { EmployeeZonesService } from './zones.service';
import { EmployeeSmartMatchingController } from './smart-matching.controller';
import { EmployeeSmartMatchingService } from './smart-matching.service';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { MarketingModule } from '../marketing/marketing.module';
import { EmployeeMarketingController } from './marketing.controller';
import { EmployeeMarketingService } from './marketing.service';
import { EmployeeQualityController } from './quality.controller';
import { EmployeeQualityService } from './quality.service';
import { EmployeeSupportCenterService } from './support-center.service';

@Module({
  imports: [
    AuthModule,
    ProviderOnboardingModule,
    BookingsModule,
    DisputesModule,
    PricingModule,
    GeocodingModule,
    MarketingModule,
  ],
  controllers: [
    EmployeeDashboardController,
    EmployeeUsersController,
    EmployeeSupportController,
    EmployeeTicketsController,
    EmployeeSupportCenterController,
    EmployeeOperationsController,
    EmployeeProviderRequestsController,
    EmployeeProviderIdentityController,
    EmployeeProviderTeamsController,
    EmployeeDisputesController,
    EmployeeBookingsController,
    EmployeeFinanceController,
    EmployeeServicesController,
    EmployeeZonesController,
    EmployeeSmartMatchingController,
    EmployeeMarketingController,
    EmployeeQualityController,
  ],
  providers: [
    EmployeeDashboardService,
    EmployeeOperationsService,
    EmployeeProviderIdentityService,
    EmployeeProviderTeamsService,
    EmployeeUsersService,
    EmployeeBookingsService,
    EmployeeFinanceService,
    EmployeeServicesService,
    EmployeeZonesService,
    EmployeeSmartMatchingService,
    EmployeeMarketingService,
    EmployeeQualityService,
    EmployeeSupportCenterService,
  ],
})
export class EmployeeModule {}
