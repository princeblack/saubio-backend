import { Injectable } from '@nestjs/common';
import type { Prisma, IdentityAuditAction as PrismaIdentityAuditAction, IdentityAuditLog, ProviderProfile, User, Document } from '@prisma/client';
import type { AdminPaginatedResponse, AdminIdentityAuditLogItem, IdentityAuditAction, IdentityDocumentTypeConfig, ProviderIdentityDocumentType } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityDocumentTypesService } from './identity-document-types.service';
import { IdentityAuditQueryDto } from './dto/identity-audit-query.dto';

interface AuditEntryWithRelations extends IdentityAuditLog {
  provider: ProviderProfile & { user?: User | null };
  document?: Document | null;
}

interface LogEvent {
  providerId: string;
  documentId?: string;
  actorId?: string;
  actorLabel?: string;
  action: PrismaIdentityAuditAction;
  payload?: Record<string, unknown>;
}

@Injectable()
export class IdentityAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentTypes: IdentityDocumentTypesService
  ) {}

  async log(event: LogEvent) {
    await this.prisma.identityAuditLog.create({
      data: {
        providerId: event.providerId,
        documentId: event.documentId ?? null,
        actorId: event.actorId ?? null,
        actorLabel: event.actorLabel ?? null,
        action: event.action,
        payload: event.payload ? (event.payload as Prisma.JsonObject) : undefined,
      },
    });
  }

  async list(query: IdentityAuditQueryDto): Promise<AdminPaginatedResponse<AdminIdentityAuditLogItem>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = Math.min(query.limit && query.limit > 0 ? query.limit : 25, 100);
    const where: Prisma.IdentityAuditLogWhereInput = {};

    if (query.providerId) {
      where.providerId = query.providerId;
    }
    if (query.actorId) {
      where.actorId = query.actorId;
    }
    if (query.documentId) {
      where.documentId = query.documentId;
    }
    if (query.action) {
      const normalized = query.action.toUpperCase();
      if (this.isValidAction(normalized)) {
        where.action = normalized;
      }
    }
    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    const skip = (page - 1) * pageSize;
    const [total, entries, typeIndex] = await Promise.all([
      this.prisma.identityAuditLog.count({ where }),
      this.prisma.identityAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          provider: { include: { user: true } },
          document: true,
        },
      }),
      this.buildTypeIndex(),
    ]);

    return {
      items: entries.map((entry) => this.mapEntry(entry as AuditEntryWithRelations, typeIndex)),
      total,
      page,
      pageSize,
    };
  }

  async timeline(providerId: string, limit = 50): Promise<AdminIdentityAuditLogItem[]> {
    const [entries, typeIndex] = await Promise.all([
      this.prisma.identityAuditLog.findMany({
        where: { providerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          provider: { include: { user: true } },
          document: true,
        },
      }),
      this.buildTypeIndex(),
    ]);
    return entries.map((entry) => this.mapEntry(entry as AuditEntryWithRelations, typeIndex));
  }

  private mapEntry(entry: AuditEntryWithRelations, typeIndex: Record<string, IdentityDocumentTypeConfig>): AdminIdentityAuditLogItem {
    const providerName = this.composeName(entry.provider.user) || entry.providerId;
    const providerEmail = entry.provider.user?.email ?? undefined;
    const payload = entry.payload ? (entry.payload as Record<string, unknown>) : undefined;
    const documentType = this.extractDocumentType(entry, payload);
    const documentLabel = documentType ? this.resolveDocumentLabel(documentType, typeIndex) : undefined;

    return {
      id: entry.id,
      providerId: entry.providerId,
      providerName,
      providerEmail,
      documentId: entry.documentId ?? undefined,
      documentType,
      documentLabel,
      actorId: entry.actorId ?? undefined,
      actorLabel: entry.actorLabel ?? undefined,
      action: entry.action.toLowerCase() as IdentityAuditAction,
      createdAt: entry.createdAt.toISOString(),
      payload,
    };
  }

  private composeName(user?: User | null) {
    if (!user) {
      return undefined;
    }
    const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return full || user.email || undefined;
  }

  private extractDocumentType(entry: AuditEntryWithRelations, payload?: Record<string, unknown>) {
    const fromPayload = payload?.['documentType'];
    if (typeof fromPayload === 'string' && fromPayload.trim().length) {
      return fromPayload.trim().toLowerCase() as ProviderIdentityDocumentType;
    }
    const metadata = entry.document?.metadata;
    if (metadata && typeof metadata === 'object') {
      const meta = metadata as Record<string, unknown>;
      const metaType = meta['documentType'];
      if (typeof metaType === 'string') {
        return metaType.trim().toLowerCase() as ProviderIdentityDocumentType;
      }
    }
    return undefined;
  }

  private async buildTypeIndex(): Promise<Record<string, IdentityDocumentTypeConfig>> {
    const definitions = await this.documentTypes.list({ includeArchived: true });
    return definitions.reduce<Record<string, IdentityDocumentTypeConfig>>((acc, definition) => {
      acc[definition.code] = definition;
      return acc;
    }, {});
  }

  private resolveDocumentLabel(code: ProviderIdentityDocumentType, index: Record<string, IdentityDocumentTypeConfig>) {
    const definition = index[code];
    return definition?.label.fr ?? code.toUpperCase();
  }

  private isValidAction(value: string): value is PrismaIdentityAuditAction {
    return ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESET', 'REQUESTED_DOCUMENT', 'NOTE'].includes(value);
  }
}
