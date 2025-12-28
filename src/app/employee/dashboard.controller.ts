import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminDashboardResponse } from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployeeDashboardService } from './dashboard.service';

@ApiTags('employee')
@Controller('employee/dashboard')
@UseGuards(AccessTokenGuard, RolesGuard)
export class EmployeeDashboardController {
  constructor(private readonly dashboardService: EmployeeDashboardService) {}

  @Get()
  @Roles('employee', 'admin')
  @ApiOperation({ summary: 'Retrieve employee dashboard metrics' })
  @ApiOkResponse({ description: 'Dashboard data returned successfully.' })
  getDashboard(): Promise<AdminDashboardResponse> {
    return this.dashboardService.getDashboard();
  }
}
