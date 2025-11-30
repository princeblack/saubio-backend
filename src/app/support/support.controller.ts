import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketFiltersDto } from './dto/support-ticket-filters.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';

@ApiTags('support')
@Controller('support')
@UseGuards(AccessTokenGuard, RolesGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiOperation({ summary: 'List support tickets' })
  @ApiOkResponse({ description: 'Support ticket list returned successfully.' })
  @Get('tickets')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  findAll(@Query() filters: SupportTicketFiltersDto, @CurrentUser() user: User) {
    return this.supportService.findAll(filters, user);
  }

  @ApiOperation({ summary: 'Retrieve a support ticket' })
  @ApiOkResponse({ description: 'Support ticket retrieved successfully.' })
  @Get('tickets/:id')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.supportService.findOne(id, user);
  }

  @ApiOperation({ summary: 'Create a new support ticket' })
  @ApiCreatedResponse({ description: 'Support ticket created successfully.' })
  @Post('tickets')
  @Roles('client', 'provider', 'company')
  create(@Body() payload: CreateSupportTicketDto, @CurrentUser() user: User) {
    return this.supportService.create(payload, user);
  }

  @ApiOperation({ summary: 'Post a message to a support ticket' })
  @ApiCreatedResponse({ description: 'Support ticket message created.' })
  @Post('tickets/:id/messages')
  @Roles('client', 'provider', 'company', 'employee', 'admin')
  addMessage(@Param('id') id: string, @Body() payload: CreateSupportMessageDto, @CurrentUser() user: User) {
    return this.supportService.addMessage(id, payload, user);
  }

  @ApiOperation({ summary: 'Update an existing support ticket' })
  @ApiOkResponse({ description: 'Support ticket updated successfully.' })
  @Patch('tickets/:id')
  @Roles('employee', 'admin')
  update(@Param('id') id: string, @Body() payload: UpdateSupportTicketDto, @CurrentUser() user: User) {
    return this.supportService.update(id, payload, user);
  }
}
