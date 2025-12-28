import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { MarkManyNotificationsDto } from './dto/mark-many-notifications.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';
import type { Prisma } from '@prisma/client';
import { NotificationType } from '@prisma/client';
import type { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { NotificationEventsService, NotificationRealtimeEvent } from './notification-events.service';

interface EmitNotificationPayload {
  userIds: string[];
  type: NotificationType;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}

const NOTIFICATION_DEDUPE_FIELD = '__dedupeKey';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEvents: NotificationEventsService
  ) {}

  async list(userId: string, query: ListNotificationsDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.unread === 'true') {
      where.readAt = null;
    }

    const take = query.limit && query.limit > 0 ? query.limit : 20;

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip: query.cursor ? 1 : undefined,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });
  }

  async markRead(id: string, userId: string, elevated = false) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException('NOTIFICATION_NOT_FOUND');
    }

    if (!elevated && notification.userId !== userId) {
      throw new NotFoundException('NOTIFICATION_NOT_FOUND');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markMany(userId: string, dto: MarkManyNotificationsDto) {
    const { all, ids } = dto;

    if (!all && (!ids || ids.length === 0)) {
      return { count: 0 };
    }

    const where: Prisma.NotificationWhereInput = { userId };
    if (!all && ids) {
      where.id = { in: ids };
    }

    const result = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });

    return { count: result.count };
  }

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
  }

  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        channels: dto.channels ? { set: dto.channels } : undefined,
        mutedTypes: dto.mutedTypes ? { set: dto.mutedTypes } : undefined,
        language: dto.language,
      },
      create: {
        userId,
        channels: dto.channels ?? undefined,
        mutedTypes: dto.mutedTypes ?? [],
        language: dto.language,
      },
    });
  }

  stream(userId: string): Observable<MessageEvent> {
    return this.notificationEvents.createStream(userId);
  }

  async emit(payload: EmitNotificationPayload) {
    let uniqueUserIds = Array.from(new Set(payload.userIds));
    if (uniqueUserIds.length === 0) {
      return;
    }

    if (payload.dedupeKey) {
      const existing = await this.prisma.notification.findMany({
        where: {
          userId: { in: uniqueUserIds },
          type: payload.type,
          payload: {
            path: [NOTIFICATION_DEDUPE_FIELD],
            equals: payload.dedupeKey,
          },
        },
        select: { userId: true },
      });
      if (existing.length) {
        const alreadyNotified = new Set(existing.map((entry) => entry.userId));
        uniqueUserIds = uniqueUserIds.filter((userId) => !alreadyNotified.has(userId));
        if (uniqueUserIds.length === 0) {
          return;
        }
      }
    }

    const serializedPayload = {
      ...payload.payload,
      ...(payload.dedupeKey ? { [NOTIFICATION_DEDUPE_FIELD]: payload.dedupeKey } : {}),
    } as Prisma.JsonObject;
    const createdAtIso = new Date().toISOString();

    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        type: payload.type,
        payload: serializedPayload,
      })),
    });

    const events: NotificationRealtimeEvent[] = uniqueUserIds.map((userId) => ({
      userId,
      type: payload.type,
      payload: payload.payload,
      createdAt: createdAtIso,
    }));

    await this.notificationEvents.broadcastBatch(events);

    uniqueUserIds.forEach((userId) => {
      this.logger.log(
        `Notification dispatched → ${userId} [${payload.type}] ${JSON.stringify(payload.payload)}`
      );
    });
  }
}
