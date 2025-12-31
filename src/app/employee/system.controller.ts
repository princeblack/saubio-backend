import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AdminPaginatedResponse,
  AdminSystemHealthResponse,
  AdminSystemInfoResponse,
  AdminSystemIntegrationsResponse,
  AdminWebhookLogDetail,
  AdminWebhookLogItem,
} from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployeeSystemService } from './system.service';
import {
  SystemApiKeysQueryDto,
  SystemExportJobsQueryDto,
  SystemImportJobsQueryDto,
  SystemWebhookLogsQueryDto,
} from './dto/admin-system.dto';

@ApiTags('employee')
@Controller('employee/system')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeSystemController {
  constructor(private readonly systemService: EmployeeSystemService) {}

  @Get('health')
  @ApiOperation({ summary: 'État de santé de la plateforme' })
  @ApiOkResponse({ description: 'Statut système retourné' })
  getHealth(): Promise<AdminSystemHealthResponse> {
    return this.systemService.getHealthOverview();
  }

  @Get('integrations')
  @ApiOperation({ summary: 'Statut des intégrations externes' })
  getIntegrations(): Promise<AdminSystemIntegrationsResponse> {
    return this.systemService.getIntegrationsOverview();
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'Clés API internes utilisées par les intégrations' })
  listApiKeys(@Query() query: SystemApiKeysQueryDto) {
    return this.systemService.listApiKeys(query);
  }

  @Get('imports')
  @ApiOperation({ summary: 'Historique des imports de données' })
  listImportJobs(@Query() query: SystemImportJobsQueryDto) {
    return this.systemService.listImportJobs(query);
  }

  @Get('exports')
  @ApiOperation({ summary: 'Exports de données générés pour la BI/compliance' })
  listExportJobs(@Query() query: SystemExportJobsQueryDto) {
    return this.systemService.listExportJobs(query);
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'Historique des webhooks entrants' })
  listWebhooks(
    @Query() query: SystemWebhookLogsQueryDto
  ): Promise<AdminPaginatedResponse<AdminWebhookLogItem>> {
    return this.systemService.listWebhookEvents(query);
  }

  @Get('webhooks/:id')
  @ApiOperation({ summary: 'Détail d\'un webhook' })
  getWebhook(@Param('id') id: string): Promise<AdminWebhookLogDetail> {
    return this.systemService.getWebhookEvent(id);
  }

  @Get('info')
  @ApiOperation({ summary: 'Informations d\'environnement' })
  getSystemInfo(): Promise<AdminSystemInfoResponse> {
    return this.systemService.getSystemInfo();
  }
}
