import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';
import { SecurityService } from './security.service';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { ListLoginAttemptsDto } from './dto/list-login-attempts.dto';
import { ListSecurityLogsDto } from './dto/list-logs.dto';
import { ListSecurityIncidentsDto } from './dto/list-incidents.dto';
import { CreateSecurityIncidentDto } from './dto/create-incident.dto';
import { UpdateSecurityIncidentDto } from './dto/update-incident.dto';
import { ListEmployeeUsersDto } from './dto/list-employee-users.dto';
import { UpdateEmployeeRoleDto } from './dto/update-employee-role.dto';

@ApiTags('admin-security')
@Controller('admin/security')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('sessions')
  listSessions(@Query() query: ListSessionsDto) {
    return this.security.listSessions(query);
  }

  @Post('sessions/:id/revoke')
  revokeSession(@Param('id') id: string) {
    return this.security.revokeSession(id);
  }

  @Get('login-attempts')
  listLoginAttempts(@Query() query: ListLoginAttemptsDto) {
    return this.security.listLoginAttempts(query);
  }

  @Get('logs')
  listLogs(@Query() query: ListSecurityLogsDto) {
    return this.security.listSecurityLogs(query);
  }

  @Get('incidents')
  listIncidents(@Query() query: ListSecurityIncidentsDto) {
    return this.security.listSecurityIncidents(query);
  }

  @Post('incidents')
  createIncident(@Body() payload: CreateSecurityIncidentDto, @CurrentUser() user: User) {
    return this.security.createIncident(payload, this.actor(user));
  }

  @Patch('incidents/:id')
  updateIncident(
    @Param('id') id: string,
    @Body() payload: UpdateSecurityIncidentDto,
    @CurrentUser() user: User
  ) {
    return this.security.updateIncident(id, payload, this.actor(user));
  }

  @Get('roles')
  listRoles() {
    return this.security.getRolesOverview();
  }

  @Get('employee-users')
  listEmployeeUsers(@Query() query: ListEmployeeUsersDto) {
    return this.security.listEmployeeUsers(query);
  }

  @Patch('employee-users/:id/role')
  updateEmployeeRole(
    @Param('id') id: string,
    @Body() payload: UpdateEmployeeRoleDto,
    @CurrentUser() user: User
  ) {
    return this.security.updateEmployeeRole(id, payload, this.actor(user));
  }

  private actor(user: User) {
    const label = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    return { id: user.id, label };
  }
}
