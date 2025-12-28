import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AdminMarketingLandingPagesResponse,
  AdminMarketingOverviewResponse,
  AdminMarketingSettingsResponse,
  AdminPaginatedResponse,
  AdminPromoCodeDetail,
  AdminPromoCodeListItem,
  AdminPromoCodeStatsResponse,
  AdminPromoCodeUsageRecord,
  User,
} from '@saubio/models';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  MarketingRangeQueryDto,
  PromoCodeListQueryDto,
  PromoCodeMutationDto,
  PromoCodeStatusDto,
  PromoCodeUsageQueryDto,
} from './dto/admin-marketing.dto';
import { EmployeeMarketingService } from './marketing.service';

@ApiTags('employee')
@Controller('employee/marketing')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeMarketingController {
  constructor(private readonly marketingService: EmployeeMarketingService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Marketing KPIs' })
  async overview(@Query() query: MarketingRangeQueryDto): Promise<AdminMarketingOverviewResponse> {
    return this.marketingService.getOverview(query);
  }

  @Get('promo-codes')
  @ApiOperation({ summary: 'List promo codes' })
  async listPromoCodes(
    @Query() query: PromoCodeListQueryDto
  ): Promise<AdminPaginatedResponse<AdminPromoCodeListItem>> {
    return this.marketingService.listPromoCodes(query);
  }

  @Post('promo-codes')
  @ApiOperation({ summary: 'Create promo code' })
  @ApiOkResponse({ description: 'Promo code created' })
  async createPromoCode(
    @Body() dto: PromoCodeMutationDto,
    @CurrentUser() user: User
  ): Promise<AdminPromoCodeDetail> {
    return this.marketingService.createPromoCode(dto, user.id);
  }

  @Patch('promo-codes/:id')
  @ApiOperation({ summary: 'Update promo code' })
  async updatePromoCode(
    @Param('id') id: string,
    @Body() dto: PromoCodeMutationDto,
    @CurrentUser() user: User
  ): Promise<AdminPromoCodeDetail> {
    return this.marketingService.updatePromoCode(id, dto, user.id);
  }

  @Patch('promo-codes/:id/status')
  @ApiOperation({ summary: 'Toggle promo code status' })
  async deactivatePromoCode(
    @Param('id') id: string,
    @Body() dto: PromoCodeStatusDto
  ): Promise<AdminPromoCodeDetail> {
    return this.marketingService.updatePromoCodeStatus(id, dto.isActive);
  }

  @Get('promo-codes/:id')
  @ApiOperation({ summary: 'Promo code details' })
  async promoCodeDetail(@Param('id') id: string): Promise<AdminPromoCodeDetail> {
    return this.marketingService.getPromoCode(id);
  }

  @Get('promo-codes/:id/stats')
  @ApiOperation({ summary: 'Promo code stats' })
  async promoCodeStats(
    @Param('id') id: string,
    @Query() query: MarketingRangeQueryDto
  ): Promise<AdminPromoCodeStatsResponse> {
    return this.marketingService.getPromoCodeStats(id, query);
  }

  @Get('promo-codes/:id/usages')
  @ApiOperation({ summary: 'Promo code usages' })
  async promoCodeUsages(
    @Param('id') id: string,
    @Query() query: PromoCodeUsageQueryDto
  ): Promise<AdminPaginatedResponse<AdminPromoCodeUsageRecord>> {
    return this.marketingService.listPromoCodeUsages(id, query);
  }

  @Get('landing')
  @ApiOperation({ summary: 'Liste des landing pages marketing' })
  async landingPages(): Promise<AdminMarketingLandingPagesResponse> {
    return this.marketingService.getLandingPages();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Paramètres marketing globaux' })
  async marketingSettings(): Promise<AdminMarketingSettingsResponse> {
    return this.marketingService.getMarketingSettings();
  }
}
