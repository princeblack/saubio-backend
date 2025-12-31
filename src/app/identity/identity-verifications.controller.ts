import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { User } from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminIdentityService } from './admin-identity.service';
import { AdminIdentityVerificationsQueryDto } from './dto/admin-identity-verifications-query.dto';
import {
  AdminIdentityDecisionDto,
  AdminIdentityRejectDto,
  AdminIdentityResetDto,
  AdminIdentityUnderReviewDto,
} from './dto/admin-identity-decision.dto';

@ApiTags('admin-identity')
@Controller('admin/identity')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class IdentityVerificationsController {
  constructor(private readonly identityService: AdminIdentityService) {}

  @Get('verifications')
  list(@Query() query: AdminIdentityVerificationsQueryDto) {
    return this.identityService.listVerifications(query);
  }

  @Get('verifications/:providerId')
  get(@Param('providerId') providerId: string) {
    return this.identityService.getVerification(providerId);
  }

  @Post('verifications/:providerId/approve')
  approve(
    @Param('providerId') providerId: string,
    @Body() payload: AdminIdentityDecisionDto,
    @CurrentUser() user: User
  ) {
    return this.identityService.approve(providerId, payload, this.resolveReviewer(user));
  }

  @Post('verifications/:providerId/reject')
  reject(
    @Param('providerId') providerId: string,
    @Body() payload: AdminIdentityRejectDto,
    @CurrentUser() user: User
  ) {
    return this.identityService.reject(providerId, payload, this.resolveReviewer(user));
  }

  @Post('verifications/:providerId/reset')
  reset(
    @Param('providerId') providerId: string,
    @Body() payload: AdminIdentityResetDto,
    @CurrentUser() user: User
  ) {
    return this.identityService.reset(providerId, payload, this.resolveReviewer(user));
  }

  @Post('verifications/:providerId/under-review')
  markUnderReview(
    @Param('providerId') providerId: string,
    @Body() payload: AdminIdentityUnderReviewDto,
    @CurrentUser() user: User
  ) {
    return this.identityService.markUnderReview(providerId, payload, this.resolveReviewer(user));
  }

  private resolveReviewer(user: User) {
    const label = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    return { id: user.id, label };
  }
}
