import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminNotificationAutomationRule,
  AdminNotificationLogItem,
  AdminNotificationTemplate,
  AdminPaginatedResponse,
} from '@saubio/models';
import type { Prisma, NotificationTemplate, NotificationAutomationRule } from '@prisma/client';
import {
  NotificationAutomationAudience,
  NotificationAutomationEvent,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationTemplateStatus,
  NotificationType,
} from '@prisma/client';
import {
  NotificationAutomationRuleUpdateDto,
  NotificationLogQueryDto,
  NotificationTemplateUpdateDto,
} from './dto/admin-notifications.dto';

const DEFAULT_PAGE_SIZE = 25;
const NOTIFICATION_LOG_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
  booking: {
    select: {
      id: true,
      service: true,
      addressCity: true,
      addressPostalCode: true,
      startAt: true,
      status: true,
    },
  },
  provider: {
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
} satisfies Prisma.NotificationInclude;

type NotificationLogRecord = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_LOG_INCLUDE;
}>;

@Injectable()
export class EmployeeNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listLogs(query: NotificationLogQueryDto): Promise<AdminPaginatedResponse<AdminNotificationLogItem>> {
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? '25', 10) || DEFAULT_PAGE_SIZE, 1), 200);
    const where: Prisma.NotificationWhereInput = {};

    if (query.status) {
      where.deliveryStatus = query.status;
    }
    if (query.channel) {
      where.channel = query.channel;
    }
    if (query.templateKey) {
      where.templateKey = query.templateKey;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.search) {
      where.OR = [
        { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { templateKey: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const skip = (page - 1) * pageSize;
    const [records, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: NOTIFICATION_LOG_INCLUDE,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items: records.map((record) => this.mapNotificationLog(record)),
      total,
      page,
      pageSize,
    };
  }

  async getLog(id: string): Promise<AdminNotificationLogItem> {
    const record = await this.prisma.notification.findUnique({
      where: { id },
      include: NOTIFICATION_LOG_INCLUDE,
    });

    if (!record) {
      throw new NotFoundException('NOTIFICATION_LOG_NOT_FOUND');
    }

    return this.mapNotificationLog(record);
  }

  async listTemplates(): Promise<AdminNotificationTemplate[]> {
    const templates = await this.prisma.notificationTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
    return templates.map((template) => this.mapTemplate(template));
  }

  async getTemplate(key: string): Promise<AdminNotificationTemplate> {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { key } });
    if (!template) {
      throw new NotFoundException('NOTIFICATION_TEMPLATE_NOT_FOUND');
    }
    return this.mapTemplate(template);
  }

  async updateTemplate(key: string, dto: NotificationTemplateUpdateDto): Promise<AdminNotificationTemplate> {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { key } });
    if (!template) {
      throw new NotFoundException('NOTIFICATION_TEMPLATE_NOT_FOUND');
    }

    const updated = await this.prisma.notificationTemplate.update({
      where: { key },
      data: {
        status: dto.status ?? undefined,
        activeChannels: dto.activeChannels ? { set: dto.activeChannels } : undefined,
        locales: dto.locales ? { set: dto.locales } : undefined,
      },
    });

    return this.mapTemplate(updated);
  }

  async listAutomationRules(): Promise<AdminNotificationAutomationRule[]> {
    const rules = await this.prisma.notificationAutomationRule.findMany({
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    });
    return rules.map((rule) => this.mapAutomationRule(rule));
  }

  async updateAutomationRule(id: string, dto: NotificationAutomationRuleUpdateDto): Promise<AdminNotificationAutomationRule> {
    const existing = await this.prisma.notificationAutomationRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('NOTIFICATION_RULE_NOT_FOUND');
    }

    const updated = await this.prisma.notificationAutomationRule.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        audience: dto.audience ?? undefined,
        channels: dto.channels ? { set: dto.channels } : undefined,
        delaySeconds: dto.delaySeconds === undefined ? undefined : dto.delaySeconds,
        isActive: dto.isActive ?? undefined,
        templateId: dto.templateId === undefined ? undefined : dto.templateId,
      },
      include: { template: true },
    });

    return this.mapAutomationRule(updated);
  }

  private mapNotificationLog(record: NotificationLogRecord): AdminNotificationLogItem {
    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      type: record.type.toLowerCase() as AdminNotificationLogItem['type'],
      channel: record.channel.toLowerCase() as AdminNotificationLogItem['channel'],
      deliveryStatus: record.deliveryStatus.toLowerCase() as AdminNotificationLogItem['deliveryStatus'],
      templateKey: record.templateKey ?? null,
      payload: record.payload as Record<string, unknown>,
      booking: record.booking
        ? {
            id: record.booking.id,
            service: record.booking.service,
            city: record.booking.addressCity,
            postalCode: record.booking.addressPostalCode,
            startAt: record.booking.startAt?.toISOString() ?? null,
            status: record.booking.status.toLowerCase() as AdminNotificationLogItem['booking']['status'],
          }
        : null,
      user: record.user
        ? {
            id: record.user.id,
            name: `${record.user.firstName} ${record.user.lastName}`.trim(),
            email: record.user.email,
            roles: record.user.roles.map((role) => role.toLowerCase()) as AdminNotificationLogItem['user']['roles'],
          }
        : null,
      provider: record.provider
        ? {
            id: record.provider.id,
            name: record.provider.user
              ? `${record.provider.user.firstName} ${record.provider.user.lastName}`.trim()
              : null,
            email: record.provider.user?.email ?? null,
          }
        : null,
      contextClientId: record.contextClientId ?? null,
      error: record.errorCode
        ? {
            code: record.errorCode,
            message: record.errorMessage ?? null,
          }
        : null,
    };
  }

  private mapTemplate(template: NotificationTemplate): AdminNotificationTemplate {
    return {
      id: template.id,
      key: template.key,
      name: template.name,
      description: template.description ?? null,
      status: template.status.toLowerCase() as AdminNotificationTemplate['status'],
      supportedChannels: template.supportedChannels.map((channel) => channel.toLowerCase()) as AdminNotificationTemplate['supportedChannels'],
      activeChannels: template.activeChannels.map((channel) => channel.toLowerCase()) as AdminNotificationTemplate['activeChannels'],
      locales: template.locales ?? [],
      metadata: this.toRecordOrNull(template.metadata),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }

  private mapAutomationRule(
    rule: NotificationAutomationRule & { template?: NotificationTemplate | null }
  ): AdminNotificationAutomationRule {
    return {
      id: rule.id,
      key: rule.key,
      name: rule.name,
      description: rule.description ?? null,
      event: rule.event.toLowerCase() as AdminNotificationAutomationRule['event'],
      audience: rule.audience.toLowerCase() as AdminNotificationAutomationRule['audience'],
      channels: rule.channels.map((channel) => channel.toLowerCase()) as AdminNotificationAutomationRule['channels'],
      delaySeconds: rule.delaySeconds ?? null,
      isActive: rule.isActive,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      template: rule.template
        ? {
            id: rule.template.id,
            key: rule.template.key,
            name: rule.template.name,
          }
        : null,
      conditions: (rule.conditions ?? {}) as Record<string, unknown>,
    };
  }

  private toRecordOrNull(value: Prisma.JsonValue | null): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }
}
