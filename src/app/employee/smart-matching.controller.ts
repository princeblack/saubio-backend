import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type {
  AdminPaginatedResponse,
  AdminSmartMatchingConfig,
  AdminSmartMatchingDetail,
  AdminSmartMatchingGuardrailResponse,
  AdminSmartMatchingHistoryItem,
  AdminSmartMatchingOverviewResponse,
  AdminSmartMatchingPolicyResponse,
  AdminSmartMatchingScenarioResponse,
  AdminSmartMatchingSimulationResponse,
} from '@saubio/models';
import { EmployeeSmartMatchingService } from './smart-matching.service';
import {
  SmartMatchingConfigDto,
  SmartMatchingHistoryQueryDto,
  SmartMatchingRangeQueryDto,
  SmartMatchingSimulationDto,
} from './dto/smart-matching.dto';

@ApiTags('employee')
@Controller('employee/smart-matching')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeSmartMatchingController {
  constructor(private readonly smartMatching: EmployeeSmartMatchingService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Smart matching overview stats' })
  async overview(@Query() query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingOverviewResponse> {
    return this.smartMatching.getOverview(query);
  }

  @Get('history')
  @ApiOperation({ summary: 'List smart matching attempts' })
  async history(
    @Query() query: SmartMatchingHistoryQueryDto
  ): Promise<AdminPaginatedResponse<AdminSmartMatchingHistoryItem>> {
    return this.smartMatching.listHistory(query);
  }

  @Get('history/:bookingId')
  @ApiOperation({ summary: 'Detail trace for specific booking matching' })
  async detail(@Param('bookingId') bookingId: string): Promise<AdminSmartMatchingDetail> {
    return this.smartMatching.getHistoryDetail(bookingId);
  }

  @Get('scenarios')
  @ApiOperation({ summary: 'Aggregated stats per matching scenario' })
  async scenarios(@Query() query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingScenarioResponse> {
    return this.smartMatching.listScenarioMetrics(query);
  }

  @Get('policies')
  @ApiOperation({ summary: 'Business policy compliance metrics' })
  async policies(@Query() query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingPolicyResponse> {
    return this.smartMatching.listPolicyMetrics(query);
  }

  @Get('guardrails')
  @ApiOperation({ summary: 'Guardrail monitoring (providers & clients)' })
  async guardrails(@Query() query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingGuardrailResponse> {
    return this.smartMatching.listGuardrailMetrics(query);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get smart matching config' })
  @ApiOkResponse()
  async config(): Promise<AdminSmartMatchingConfig> {
    return this.smartMatching.getConfig();
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update smart matching config' })
  async updateConfig(@Body() payload: SmartMatchingConfigDto): Promise<AdminSmartMatchingConfig> {
    return this.smartMatching.updateConfig(payload);
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Simulate smart matching run without notifications' })
  async simulate(@Body() payload: SmartMatchingSimulationDto): Promise<AdminSmartMatchingSimulationResponse> {
    return this.smartMatching.simulate(payload);
  }
}
