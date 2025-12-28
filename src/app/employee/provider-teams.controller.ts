import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateProviderTeamDto, UpdateProviderTeamDto } from '../provider/dto/create-provider-team.dto';
import { EmployeeProviderTeamsService } from './provider-teams.service';
import { TeamPlanRangeQueryDto } from './dto/team-plan-range.dto';

@ApiTags('employee')
@Controller('employee/providers/teams')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee')
export class EmployeeProviderTeamsController {
  constructor(private readonly teamsService: EmployeeProviderTeamsService) {}

  @Get()
  list(@Query('ownerId') ownerId?: string) {
    return this.teamsService.list(ownerId?.trim() || undefined);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.teamsService.get(id);
  }

  @Get(':id/schedule')
  getSchedule(@Param('id') id: string) {
    return this.teamsService.getSchedule(id);
  }

  @Get(':id/plan')
  getPlan(@Param('id') id: string, @Query() range: TeamPlanRangeQueryDto) {
    return this.teamsService.getPlan(id, range);
  }

  @Post()
  create(@Body() payload: CreateProviderTeamDto) {
    return this.teamsService.create(payload);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() payload: UpdateProviderTeamDto) {
    return this.teamsService.update(id, payload);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.teamsService.delete(id);
  }
}
