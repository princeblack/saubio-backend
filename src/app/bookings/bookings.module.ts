import { Module, forwardRef } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { AuthModule } from '../auth/auth.module';
import { BookingMatchingService } from './booking-matching.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingNotificationsService } from './booking-notifications.service';
import { PaymentsModule } from '../payments/payments.module';
import { MatchingController } from './matching.controller';
import { BookingDraftsController } from './booking-drafts.controller';
import { BookingLocksService } from './booking-locks.service';
import { TeamPlanningService } from './team-planning.service';
import { PricingModule } from '../pricing/pricing.module';
import { MarketingModule } from '../marketing/marketing.module';

@Module({
  imports: [AuthModule, NotificationsModule, forwardRef(() => PaymentsModule), PricingModule, MarketingModule],
  controllers: [BookingsController, MatchingController, BookingDraftsController],
  providers: [
    BookingsService,
    BookingMatchingService,
    BookingNotificationsService,
    BookingLocksService,
    TeamPlanningService,
  ],
  exports: [BookingNotificationsService, TeamPlanningService, BookingsService, BookingMatchingService],
})
export class BookingsModule {}
