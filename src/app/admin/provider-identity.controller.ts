import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { User } from '@saubio/models';
import { IdentityVerificationStatus } from '@prisma/client';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminProviderIdentityService } from './provider-identity.service';
import { ReviewProviderIdentityDto } from './dto/review-provider-identity.dto';

@ApiTags('admin')
@Controller('admin/providers')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin', 'employee')
export class AdminProviderIdentityController {
  constructor(private readonly identityService: AdminProviderIdentityService) {}

  @Get('identity')
  list(@Query('status') status?: IdentityVerificationStatus) {
    return this.identityService.list(status);
  }

  @Get(':providerId/identity')
  get(@Param('providerId') providerId: string) {
    return this.identityService.get(providerId);
  }

  @Patch(':providerId/identity')
  review(
    @Param('providerId') providerId: string,
    @Body() payload: ReviewProviderIdentityDto,
    @CurrentUser() user: User
  ) {
    const reviewerLabel = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    return this.identityService.review(providerId, payload, { id: user.id, label: reviewerLabel });
  }

  @Patch(':providerId/welcome-session')
  completeWelcomeSession(@Param('providerId') providerId: string, @CurrentUser() user: User) {
    const reviewer = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    return this.identityService.completeWelcomeSession(providerId, reviewer);
  }
}
