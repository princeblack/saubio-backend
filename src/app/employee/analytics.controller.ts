import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type {
  AdminAnalyticsCohortResponse,
  AdminAnalyticsFunnelResponse,
  AdminAnalyticsOpsResponse,
  AdminAnalyticsOverviewResponse,
  AdminAnalyticsZonesResponse,
} from '@saubio/models';
import { EmployeeAnalyticsService } from './analytics.service';
import {
  AnalyticsCohortQueryDto,
  AnalyticsFunnelQueryDto,
  AnalyticsOpsQueryDto,
  AnalyticsRangeQueryDto,
  AnalyticsZonesQueryDto,
} from './dto/admin-analytics.dto';

@ApiTags('employee')
@Controller('employee/analytics')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeAnalyticsController {
  constructor(private readonly analyticsService: EmployeeAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Global KPIs for bookings & payments' })
  @ApiOkResponse({ description: 'Return overview KPIs' })
  async overview(@Query() query: AnalyticsRangeQueryDto): Promise<AdminAnalyticsOverviewResponse> {
    return this.analyticsService.getOverview(query);
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Booking funnel breakdown' })
  async funnel(@Query() query: AnalyticsFunnelQueryDto): Promise<AdminAnalyticsFunnelResponse> {
    return this.analyticsService.getFunnel(query);
  }

  @Get('cohorts')
  @ApiOperation({ summary: 'Client/provider retention cohorts' })
  async cohorts(@Query() query: AnalyticsCohortQueryDto): Promise<AdminAnalyticsCohortResponse> {
    return this.analyticsService.getCohorts(query);
  }

  @Get('zones')
  @ApiOperation({ summary: 'Zone & matching performance' })
  async zones(@Query() query: AnalyticsZonesQueryDto): Promise<AdminAnalyticsZonesResponse> {
    return this.analyticsService.getZonePerformance(query);
  }

  @Get('operations')
  @ApiOperation({ summary: 'Operational quality indicators' })
  async operations(@Query() query: AnalyticsOpsQueryDto): Promise<AdminAnalyticsOpsResponse> {
    return this.analyticsService.getOperations(query);
  }
}

