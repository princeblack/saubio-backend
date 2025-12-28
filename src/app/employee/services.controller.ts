import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type {
  AdminServiceCatalogResponse,
  AdminServiceOptionsResponse,
  AdminServicePricingMatrixResponse,
  AdminServicePricingRulesResponse,
  AdminServicePreviewResponse,
  AdminServiceHabilitationsResponse,
  AdminServiceLogsResponse,
} from '@saubio/models';
import { EmployeeServicesService } from './services.service';
import { ServicePreviewQueryDto } from './dto/service-preview.dto';

@ApiTags('employee')
@Controller('employee/services')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeServicesController {
  constructor(private readonly servicesService: EmployeeServicesService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Catalogue des services' })
  @ApiOkResponse({ description: 'Retourne la liste des services et statistiques' })
  async catalog(): Promise<AdminServiceCatalogResponse> {
    return this.servicesService.getCatalog();
  }

  @Get('options')
  @ApiOperation({ summary: 'Options & add-ons disponibles' })
  async options(): Promise<AdminServiceOptionsResponse> {
    return this.servicesService.getOptions();
  }

  @Get('pricing')
  @ApiOperation({ summary: 'Grille tarifaire synthétique' })
  async pricing(): Promise<AdminServicePricingMatrixResponse> {
    return this.servicesService.getPricingMatrix();
  }

  @Get('pricing/rules')
  @ApiOperation({ summary: 'Surcharges, remises et règles de pricing' })
  async pricingRules(): Promise<AdminServicePricingRulesResponse> {
    return this.servicesService.getPricingRules();
  }

  @Get('preview')
  @ApiOperation({ summary: 'Aperçu côté client (estimation locale)' })
  async preview(@Query() query: ServicePreviewQueryDto): Promise<AdminServicePreviewResponse> {
    return this.servicesService.previewQuote(query);
  }

  @Get('habilitations')
  @ApiOperation({ summary: 'Habilitations et certifications prestataires' })
  async habilitations(): Promise<AdminServiceHabilitationsResponse> {
    return this.servicesService.getHabilitations();
  }

  @Get('logs')
  @ApiOperation({ summary: 'Historique des modifications de services' })
  async logs(): Promise<AdminServiceLogsResponse> {
    return this.servicesService.getServiceLogs();
  }
}
