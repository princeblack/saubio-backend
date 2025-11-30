import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminDashboardResponse } from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminDashboardService } from './dashboard.service';

@ApiTags('admin')
@Controller('admin/dashboard')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get()
  @Roles('admin', 'employee')
  @ApiOperation({ summary: 'Retrieve admin dashboard metrics' })
  @ApiOkResponse({ description: 'Dashboard data returned successfully.' })
  getDashboard(): Promise<AdminDashboardResponse> {
    return this.adminDashboardService.getDashboard();
  }
}
