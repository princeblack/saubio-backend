import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminConsentHistoryItem,
  AdminConsentRecord,
  AdminPaginatedResponse,
  UserRole,
} from '@saubio/models';
import type { Prisma, User, UserConsent } from '@prisma/client';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListConsentsDto } from './dto/list-consents.dto';

@Injectable()
export class ConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listConsents(query: ListConsentsDto): Promise<AdminPaginatedResponse<AdminConsentRecord>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 25, 100);
    const where: Prisma.UserConsentWhereInput = {};

    if (query.role) {
      const prismaRole = query.role.toUpperCase() as $Enums.UserRole;
      where.user = {
        roles: { has: prismaRole },
      };
    }

    if (query.q) {
      const trimmed = query.q.trim();
      if (trimmed) {
        where.OR = [
          { user: { email: { contains: trimmed, mode: 'insensitive' } } },
          { user: { firstName: { contains: trimmed, mode: 'insensitive' } } },
          { user: { lastName: { contains: trimmed, mode: 'insensitive' } } },
          { userId: trimmed },
        ];
      }
    }

    if (query.from || query.to) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.from) {
        const fromDate = new Date(query.from);
        if (!Number.isNaN(fromDate.valueOf())) {
          dateFilter.gte = fromDate;
        }
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (!Number.isNaN(toDate.valueOf())) {
          dateFilter.lte = toDate;
        }
      }
      if (Object.keys(dateFilter).length) {
        where.updatedAt = dateFilter;
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.userConsent.count({ where }),
      this.prisma.userConsent.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              roles: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => this.mapConsent(row)),
      total,
      page,
      pageSize: limit,
    };
  }

  async getHistory(userId: string): Promise<AdminConsentHistoryItem[]> {
    const consent = await this.prisma.userConsent.findUnique({
      where: { userId },
    });
    if (!consent) {
      throw new NotFoundException('CONSENT_NOT_FOUND');
    }

    const events = await this.prisma.userConsentHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return events.map((event) => ({
      id: event.id,
      userId: event.userId,
      actorId: event.actorId ?? undefined,
      actorLabel: event.actorLabel ?? undefined,
      consentMarketing: event.consentMarketing,
      consentStats: event.consentStats,
      consentPreferences: event.consentPreferences,
      consentNecessary: event.consentNecessary,
      source: event.source ?? undefined,
      channel: event.channel ?? undefined,
      ipAddress: event.ipAddress ?? undefined,
      userAgent: event.userAgent ?? undefined,
      notes: event.notes ?? undefined,
      capturedAt: event.capturedAt?.toISOString(),
      createdAt: event.createdAt.toISOString(),
    }));
  }

  private mapConsent(
    row: UserConsent & { user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'roles'> }
  ): AdminConsentRecord {
    return {
      id: row.id,
      user: {
        id: row.user.id,
        email: row.user.email,
        firstName: row.user.firstName ?? undefined,
        lastName: row.user.lastName ?? undefined,
        role: this.resolveRole(row.user.roles),
      },
      consentMarketing: row.consentMarketing,
      consentStats: row.consentStats,
      consentPreferences: row.consentPreferences,
      consentNecessary: row.consentNecessary,
      source: row.source ?? undefined,
      channel: row.channel ?? undefined,
      capturedAt: row.capturedAt?.toISOString(),
      firstCapturedAt: row.firstCapturedAt?.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private resolveRole(roles: $Enums.UserRole[]): UserRole {
    if (!roles.length) {
      return 'client';
    }
    const normalized = roles.map((role) => role.toLowerCase() as UserRole);
    if (normalized.includes('admin')) return 'admin';
    if (normalized.includes('employee')) return 'employee';
    if (normalized.includes('provider')) return 'provider';
    return normalized[0];
  }
}
