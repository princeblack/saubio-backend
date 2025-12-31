import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ConsentsService } from './consents.service';
import { ListConsentsDto } from './dto/list-consents.dto';

@ApiTags('admin-compliance')
@Controller('admin/compliance/consents')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get()
  list(@Query() query: ListConsentsDto) {
    return this.consents.listConsents(query);
  }

  @Get(':userId/history')
  history(@Param('userId') userId: string) {
    return this.consents.getHistory(userId);
  }
}
