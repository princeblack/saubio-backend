import { Injectable } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import type { BookingWithRelations } from './booking.mapper';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BookingNotificationsService {
  private opsRecipientCache: { ids: string[]; expiresAt: number } | null = null;
  private matchingProgressCache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async notifyParticipants(options: {
    booking: BookingWithRelations;
    type: NotificationType;
    payload: Record<string, unknown>;
    includeClient?: boolean;
    providerTargets?: string[];
    extraUserIds?: string[];
    dedupeKey?: string;
  }) {
    const recipients = new Set<string>(options.extraUserIds ?? []);
    if (options.includeClient !== false) {
      recipients.add(options.booking.clientId);
    }

    const providerIds =
      options.providerTargets ??
      options.booking.assignments.map((assignment) => assignment.providerId);
    const providerUserIds = await this.getProviderUserIds(providerIds);
    providerUserIds.forEach((userId) => recipients.add(userId));

    const userIds = Array.from(recipients).filter(Boolean);
    if (userIds.length === 0) {
      return;
    }

    await this.notifications.emit({
      type: options.type,
      userIds,
      payload: {
        bookingId: options.booking.id,
        ...options.payload,
      },
      dedupeKey: options.dedupeKey,
      bookingId: options.booking.id,
      contextClientId: options.booking.clientId ?? undefined,
    });
  }

  async notifyMatchingProgress(options: {
    booking: BookingWithRelations;
    payload: Record<string, unknown>;
    includeClient?: boolean;
    providerTargets?: string[];
    extraUserIds?: string[];
    includeOps?: boolean;
    dedupeKey?: string;
  }) {
    const opsRecipients =
      options.includeOps === false ? [] : await this.resolveOpsRecipients();
    const mergedExtraRecipients = new Set<string>(options.extraUserIds ?? []);
    opsRecipients.forEach((id) => mergedExtraRecipients.add(id));

    const stage = typeof options.payload.stage === 'string' ? options.payload.stage : undefined;
    const status = typeof options.payload.status === 'string' ? options.payload.status : undefined;
    const contextKey =
      (typeof options.payload.contextKey === 'string' && options.payload.contextKey) ||
      options.booking.id;
    const fingerprint =
      stage && status ? `${options.booking.id}:${contextKey}:${stage}:${status}` : null;
    if (fingerprint) {
      const expiry = this.matchingProgressCache.get(fingerprint);
      const now = Date.now();
      if (expiry && expiry > now) {
        return;
      }
      this.matchingProgressCache.set(fingerprint, now + 30_000);
    }
    const resolvedDedupeKey =
      options.dedupeKey ?? (stage && status ? `${contextKey}:${stage}:${status}` : undefined);

    await this.notifyParticipants({
      booking: options.booking,
      type: NotificationType.MATCHING_PROGRESS,
      payload: options.payload,
      includeClient: options.includeClient,
      providerTargets: options.providerTargets,
      extraUserIds: Array.from(mergedExtraRecipients),
      dedupeKey: resolvedDedupeKey,
      // ensure parent emit receives booking context
      // contextClientId is handled within notifyParticipants
    });
  }

  private async getProviderUserIds(providerProfileIds: string[]): Promise<string[]> {
    if (!providerProfileIds.length) {
      return [];
    }

    const profiles = await this.prisma.providerProfile.findMany({
      where: { id: { in: providerProfileIds } },
      select: { userId: true },
    });

    return profiles.map((profile) => profile.userId);
  }

  private async resolveOpsRecipients(): Promise<string[]> {
    if (this.opsRecipientCache && this.opsRecipientCache.expiresAt > Date.now()) {
      return this.opsRecipientCache.ids;
    }

    const opsUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { hasSome: [UserRole.ADMIN, UserRole.EMPLOYEE] },
      },
      select: { id: true },
    });

    const ids = opsUsers.map((user) => user.id);
    this.opsRecipientCache = {
      ids,
      expiresAt: Date.now() + 60_000,
    };
    return ids;
  }
}
