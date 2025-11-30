import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DisputesService } from '../disputes/disputes.service';
import { AssignDisputeDto } from '../disputes/dto/assign-dispute.dto';
import { UpdateDisputeStatusDto } from '../disputes/dto/update-dispute-status.dto';
import { AddDisputeMessageDto } from '../disputes/dto/add-dispute-message.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';
import type { DisputeStatus } from '@saubio/models';

const ADMIN_DISPUTE_STATUSES: DisputeStatus[] = [
  'open',
  'under_review',
  'action_required',
  'refunded',
  'resolved',
  'rejected',
];

@Controller('admin/disputes')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin', 'employee')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(@Query('status') status?: string) {
    const normalized =
      status && ADMIN_DISPUTE_STATUSES.includes(status as DisputeStatus)
        ? (status as DisputeStatus)
        : undefined;
    return this.disputes.listForAdmin(normalized);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.disputes.getById(id);
  }

  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() payload: AssignDisputeDto,
    @CurrentUser() user: User
  ) {
    return this.disputes.assignDispute(id, payload, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() payload: UpdateDisputeStatusDto,
    @CurrentUser() user: User
  ) {
    return this.disputes.updateStatus(id, payload, user);
  }

  @Post(':id/messages')
  comment(
    @Param('id') id: string,
    @Body() payload: AddDisputeMessageDto,
    @CurrentUser() user: User
  ) {
    return this.disputes.addAdminMessage(id, user, payload);
  }
}
