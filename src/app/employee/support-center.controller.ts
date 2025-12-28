import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type {
  AdminSupportDisputeDetail,
  AdminSupportDisputeListResponse,
  AdminSupportOverviewResponse,
  AdminSupportSlaResponse,
  AdminSupportTicketDetail,
  AdminSupportTicketListResponse,
  AdminSupportMessage,
} from '@saubio/models';
import type { User } from '@saubio/models';
import { EmployeeSupportCenterService } from './support-center.service';
import {
  SupportDisputeQueryDto,
  SupportDisputeUpdateDto,
  SupportRangeQueryDto,
  SupportTicketMessageDto,
  SupportTicketQueryDto,
  SupportTicketUpdateDto,
} from './dto/admin-support.dto';

@ApiTags('employee')
@Controller('employee/support-center')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee')
export class EmployeeSupportCenterController {
  constructor(private readonly service: EmployeeSupportCenterService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Support overview metrics' })
  @ApiOkResponse({ description: 'Overview returned successfully.' })
  getOverview(@Query() query: SupportRangeQueryDto): Promise<AdminSupportOverviewResponse> {
    return this.service.getOverview(query);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List support tickets with filters' })
  @ApiOkResponse({ description: 'Tickets listed successfully.' })
  listTickets(@Query() query: SupportTicketQueryDto): Promise<AdminSupportTicketListResponse> {
    return this.service.getTickets(query);
  }

  @Get('tickets/:ticketId')
  @ApiOperation({ summary: 'Get support ticket detail' })
  @ApiOkResponse({ description: 'Ticket fetched successfully.' })
  getTicket(@Param('ticketId') ticketId: string): Promise<AdminSupportTicketDetail> {
    return this.service.getTicket(ticketId);
  }

  @Patch('tickets/:ticketId')
  @ApiOperation({ summary: 'Update a support ticket' })
  @ApiOkResponse({ description: 'Ticket updated successfully.' })
  updateTicket(@Param('ticketId') ticketId: string, @Body() payload: SupportTicketUpdateDto) {
    return this.service.updateTicket(ticketId, payload);
  }

  @Post('tickets/:ticketId/messages')
  @ApiOperation({ summary: 'Add a ticket message' })
  @ApiOkResponse({ description: 'Message added successfully.' })
  addTicketMessage(
    @Param('ticketId') ticketId: string,
    @Body() payload: SupportTicketMessageDto,
    @CurrentUser() user: User
  ): Promise<AdminSupportMessage> {
    return this.service.addTicketMessage(ticketId, payload, user);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'List disputes and refunds' })
  @ApiOkResponse({ description: 'Disputes listed successfully.' })
  listDisputes(@Query() query: SupportDisputeQueryDto): Promise<AdminSupportDisputeListResponse> {
    return this.service.getDisputes(query);
  }

  @Get('disputes/:disputeId')
  @ApiOperation({ summary: 'Get dispute detail' })
  @ApiOkResponse({ description: 'Dispute detail returned successfully.' })
  getDispute(@Param('disputeId') disputeId: string): Promise<AdminSupportDisputeDetail> {
    return this.service.getDispute(disputeId);
  }

  @Patch('disputes/:disputeId')
  @ApiOperation({ summary: 'Update dispute' })
  @ApiOkResponse({ description: 'Dispute updated successfully.' })
  updateDispute(@Param('disputeId') disputeId: string, @Body() payload: SupportDisputeUpdateDto) {
    return this.service.updateDispute(disputeId, payload);
  }

  @Get('sla')
  @ApiOperation({ summary: 'Get SLA metrics' })
  @ApiOkResponse({ description: 'SLA metrics returned successfully.' })
  getSla(@Query() query: SupportRangeQueryDto): Promise<AdminSupportSlaResponse> {
    return this.service.getSlaMetrics(query);
  }
}
