import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminDashboardController } from './dashboard.controller';
import { AdminDashboardService } from './dashboard.service';
import { AdminUsersController } from './users.controller';
import { AdminSupportController } from './support.controller';
import { AdminTicketsController } from './tickets.controller';
import { AdminOperationsController } from './operations.controller';
import { AdminOperationsService } from './operations.service';
import { AdminProviderRequestsController } from './provider-requests.controller';
import { ProviderOnboardingModule } from '../provider-onboarding/provider-onboarding.module';
import { AdminProviderIdentityController } from './provider-identity.controller';
import { AdminProviderIdentityService } from './provider-identity.service';
import { AdminProviderTeamsController } from './provider-teams.controller';
import { AdminProviderTeamsService } from './provider-teams.service';
import { BookingsModule } from '../bookings/bookings.module';
import { DisputesModule } from '../disputes/disputes.module';
import { AdminDisputesController } from './disputes.controller';

@Module({
  imports: [AuthModule, ProviderOnboardingModule, BookingsModule, DisputesModule],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminSupportController,
    AdminTicketsController,
    AdminOperationsController,
    AdminProviderRequestsController,
    AdminProviderIdentityController,
    AdminProviderTeamsController,
    AdminDisputesController,
  ],
  providers: [AdminDashboardService, AdminOperationsService, AdminProviderIdentityService, AdminProviderTeamsService],
})
export class AdminModule {}
