import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProviderOnboardingStatus } from '@prisma/client';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProviderOnboardingService } from '../provider-onboarding/provider-onboarding.service';
import { UpdateProviderOnboardingDto } from '../provider-onboarding/dto/update-provider-onboarding.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';

@ApiTags('admin')
@Controller('admin/providers/requests')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin', 'employee')
export class AdminProviderRequestsController {
  constructor(private readonly providerOnboardingService: ProviderOnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'List provider onboarding requests' })
  @ApiOkResponse({ description: 'Requests returned successfully.' })
  list(@Query('status') status?: ProviderOnboardingStatus) {
    return this.providerOnboardingService.list(status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a provider onboarding request status' })
  update(
    @Param('id') id: string,
    @Body() payload: UpdateProviderOnboardingDto,
    @CurrentUser() user: User,
  ) {
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    const reviewer = payload.reviewer ?? (fullName.length ? fullName : user.email);
    return this.providerOnboardingService.update(id, { ...payload, reviewer });
  }
}
