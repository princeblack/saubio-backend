import { Controller, Get, Param, Patch, Query, Body, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AdminNotificationAutomationRule,
  AdminNotificationLogItem,
  AdminNotificationTemplate,
  AdminPaginatedResponse,
} from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmployeeNotificationsService } from './notifications.service';
import {
  NotificationAutomationRuleUpdateDto,
  NotificationLogQueryDto,
  NotificationTemplateUpdateDto,
} from './dto/admin-notifications.dto';

@ApiTags('employee')
@Controller('employee/notifications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('employee', 'admin')
export class EmployeeNotificationsController {
  constructor(private readonly notifications: EmployeeNotificationsService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Liste des notifications envoyées' })
  @ApiOkResponse({ description: 'Notification logs fetched' })
  listLogs(@Query() query: NotificationLogQueryDto): Promise<AdminPaginatedResponse<AdminNotificationLogItem>> {
    return this.notifications.listLogs(query);
  }

  @Get('logs/:id')
  @ApiOperation({ summary: 'Détail d\'une notification' })
  getLog(@Param('id') id: string): Promise<AdminNotificationLogItem> {
    return this.notifications.getLog(id);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Liste des templates de notification' })
  listTemplates(): Promise<AdminNotificationTemplate[]> {
    return this.notifications.listTemplates();
  }

  @Get('templates/:key')
  @ApiOperation({ summary: 'Détail d\'un template de notification' })
  getTemplate(@Param('key') key: string): Promise<AdminNotificationTemplate> {
    return this.notifications.getTemplate(key);
  }

  @Patch('templates/:key')
  @ApiOperation({ summary: 'Mettre à jour un template' })
  updateTemplate(
    @Param('key') key: string,
    @Body() dto: NotificationTemplateUpdateDto
  ): Promise<AdminNotificationTemplate> {
    return this.notifications.updateTemplate(key, dto);
  }

  @Get('automation-rules')
  @ApiOperation({ summary: 'Liste des règles d\'automatisation' })
  listAutomationRules(): Promise<AdminNotificationAutomationRule[]> {
    return this.notifications.listAutomationRules();
  }

  @Patch('automation-rules/:id')
  @ApiOperation({ summary: 'Mettre à jour une règle d\'automatisation' })
  updateAutomationRule(
    @Param('id') id: string,
    @Body() dto: NotificationAutomationRuleUpdateDto
  ): Promise<AdminNotificationAutomationRule> {
    return this.notifications.updateAutomationRule(id, dto);
  }
}
