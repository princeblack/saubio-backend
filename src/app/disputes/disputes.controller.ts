import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';
import { AddDisputeMessageDto } from './dto/add-dispute-message.dto';

@Controller('disputes')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('client')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.disputes.listForUser(user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.disputes.getForUser(id, user);
  }

  @Post()
  create(@Body() payload: CreateDisputeDto, @CurrentUser() user: User) {
    return this.disputes.createDispute(user, payload);
  }

  @Post(':id/messages')
  reply(
    @Param('id') id: string,
    @Body() payload: AddDisputeMessageDto,
    @CurrentUser() user: User
  ) {
    return this.disputes.addMessageAsClient(id, user, payload);
  }
}
