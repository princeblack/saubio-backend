import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MatchingScorePreviewDto } from './dto';
import { BookingMatchingService } from './booking-matching.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';

@Controller('matching')
@UseGuards(AccessTokenGuard, RolesGuard)
export class MatchingController {
  constructor(private readonly matching: BookingMatchingService) {}

  @Post('score-preview')
  @Roles('client', 'company', 'employee', 'admin')
  previewScores(@Body() payload: MatchingScorePreviewDto, @CurrentUser() user: User) {
    const startAt = new Date(payload.startAt);
    const endAt = new Date(payload.endAt);
    return this.matching.previewScores({
      service: payload.service,
      ecoPreference: payload.ecoPreference,
      startAt,
      endAt,
      city: payload.city,
      clientId: user.id,
      priceCeilingCents: payload.priceCeilingCents,
      requiredProviders: payload.requiredProviders ?? 1,
    });
  }
}
