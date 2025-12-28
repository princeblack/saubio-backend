import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AdminPaginatedResponse,
  AdminQualityAlertsResponse,
  AdminQualityIncidentItem,
  AdminQualityOverviewResponse,
  AdminQualityProgramResponse,
  AdminQualityProviderDetail,
  AdminQualityProviderListItem,
  AdminQualityReviewDetail,
  AdminQualityReviewListItem,
  AdminQualitySatisfactionResponse,
} from '@saubio/models';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EmployeeQualityService } from './quality.service';
import {
  QualityIncidentQueryDto,
  QualityIncidentUpdateDto,
  QualityProgramQueryDto,
  QualityProviderListQueryDto,
  QualityRangeQueryDto,
  QualityReviewListQueryDto,
  QualityReviewStatusDto,
  QualitySatisfactionQueryDto,
} from './dto/admin-quality.dto';
import type { User } from '@saubio/models';

@ApiTags('employee')
@Controller('employee/quality')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeQualityController {
  constructor(private readonly qualityService: EmployeeQualityService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Vue d’ensemble qualité & feedback' })
  async overview(@Query() query: QualityRangeQueryDto): Promise<AdminQualityOverviewResponse> {
    return this.qualityService.getOverview(query);
  }

  @Get('satisfaction')
  @ApiOperation({ summary: 'Indicateurs NPS & satisfaction' })
  async satisfaction(
    @Query() query: QualitySatisfactionQueryDto
  ): Promise<AdminQualitySatisfactionResponse> {
    return this.qualityService.getSatisfactionOverview(query);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Lister les avis clients' })
  async listReviews(
    @Query() query: QualityReviewListQueryDto
  ): Promise<AdminPaginatedResponse<AdminQualityReviewListItem>> {
    return this.qualityService.listReviews(query);
  }

  @Patch('reviews/:id')
  @ApiOperation({ summary: 'Mettre à jour le statut/modération d’un avis' })
  async updateReviewStatus(
    @Param('id') id: string,
    @Body() dto: QualityReviewStatusDto,
    @CurrentUser() user: User
  ): Promise<AdminQualityReviewDetail> {
    return this.qualityService.updateReviewStatus(id, dto, user.id);
  }

  @Get('providers')
  @ApiOperation({ summary: 'Performance qualité des prestataires' })
  async listProviders(
    @Query() query: QualityProviderListQueryDto
  ): Promise<AdminPaginatedResponse<AdminQualityProviderListItem>> {
    return this.qualityService.listProviders(query);
  }

  @Get('incidents')
  @ApiOperation({ summary: 'Incidents & litiges qualité' })
  async listIncidents(
    @Query() query: QualityIncidentQueryDto
  ): Promise<AdminPaginatedResponse<AdminQualityIncidentItem>> {
    return this.qualityService.listIncidents(query);
  }

  @Patch('incidents/:id')
  @ApiOperation({ summary: 'Mettre à jour un incident qualité' })
  async updateIncident(
    @Param('id') id: string,
    @Body() dto: QualityIncidentUpdateDto
  ): Promise<AdminQualityIncidentItem> {
    return this.qualityService.updateIncident(id, dto);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Alertes qualité automatiques' })
  async getAlerts(): Promise<AdminQualityAlertsResponse> {
    return this.qualityService.getAlerts();
  }

  @Get('program')
  @ApiOperation({ summary: 'Programme qualité prestataires' })
  async program(
    @Query() query: QualityProgramQueryDto
  ): Promise<AdminQualityProgramResponse> {
    return this.qualityService.getQualityProgramSummary(query);
  }

  @Get('program/:providerId')
  @ApiOperation({ summary: 'Détail qualité d’un prestataire' })
  async programDetail(
    @Param('providerId') providerId: string
  ): Promise<AdminQualityProviderDetail> {
    return this.qualityService.getQualityProgramProvider(providerId);
  }
}
