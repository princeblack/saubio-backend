import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdminReviewStatus,
  AdminReviewTarget,
  Document,
  DocumentReviewStatus,
  DocumentType,
  Prisma,
  IdentityVerificationStatus as PrismaIdentityVerificationStatus,
  NotificationType,
  ProviderProfile,
  User,
} from '@prisma/client';
import type {
  AdminPaginatedResponse,
  AdminIdentityVerificationDetail,
  AdminIdentityVerificationListItem,
  AdminIdentityDocumentItem,
  IdentityDocumentTypeConfig,
  ProviderIdentityDocumentType,
  ProviderIdentityDocumentSide,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminIdentityVerificationsQueryDto } from './dto/admin-identity-verifications-query.dto';
import {
  AdminIdentityDecisionDto,
  AdminIdentityRejectDto,
  AdminIdentityResetDto,
  AdminIdentityUnderReviewDto,
} from './dto/admin-identity-decision.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentityAuditService } from './identity-audit.service';
import { IdentityDocumentTypesService } from './identity-document-types.service';

interface ReviewerContext {
  id: string;
  label: string;
}

@Injectable()
export class AdminIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: IdentityAuditService,
    private readonly documentTypes: IdentityDocumentTypesService
  ) {}

  async listVerifications(query: AdminIdentityVerificationsQueryDto): Promise<AdminPaginatedResponse<AdminIdentityVerificationListItem>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = Math.min(query.limit && query.limit > 0 ? query.limit : 25, 100);
    const where = this.buildDocumentFilters(query);
    const skip = (page - 1) * pageSize;

    const [total, documents, definitions] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          provider: {
            include: { user: true },
          },
          reviewer: true,
        },
      }),
      this.documentTypes.list({ includeArchived: true }),
    ]);

    const typeIndex = this.indexDefinitions(definitions);

    return {
      items: documents
        .filter((doc) => doc.provider)
        .map((doc) => this.mapDocumentListItem(doc as Document & { provider: ProviderProfile & { user?: User | null }; reviewer?: User | null }, typeIndex)),
      total,
      page,
      pageSize,
    };
  }

  async getVerification(providerId: string): Promise<AdminIdentityVerificationDetail> {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: {
        user: true,
        documents: {
          where: { type: DocumentType.IDENTITY },
          include: { reviewer: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('PROVIDER_NOT_FOUND');
    }

    const [typeIndex, timeline] = await Promise.all([
      this.documentTypes.list({ includeArchived: true }).then((defs) => this.indexDefinitions(defs)),
      this.audit.timeline(provider.id),
    ]);

    return {
      provider: {
        id: provider.id,
        name: this.composeName(provider.user) ?? provider.id,
        email: provider.user?.email ?? '',
        phone: provider.user?.phone ?? undefined,
        status: (provider.identityVerificationStatus ?? PrismaIdentityVerificationStatus.NOT_STARTED).toLowerCase() as AdminIdentityVerificationDetail['provider']['status'],
        reviewer: provider.identityVerificationReviewer ?? undefined,
        reviewerId: provider.identityVerificationReviewerId ?? undefined,
        reviewedAt: provider.identityVerificationReviewedAt ? provider.identityVerificationReviewedAt.toISOString() : undefined,
        submittedAt: provider.identityCompletedAt ? provider.identityCompletedAt.toISOString() : undefined,
        notes: provider.identityVerificationNotes ?? undefined,
      },
      documents: provider.documents.map((doc) => this.mapDocumentDetail(doc as Document & { reviewer?: User | null }, provider, typeIndex)),
      timeline,
    };
  }

  async approve(providerId: string, payload: AdminIdentityDecisionDto, reviewer: ReviewerContext) {
    const { document, provider } = await this.resolveDocument(providerId, payload.documentId);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: document.id },
        data: {
          reviewStatus: DocumentReviewStatus.APPROVED,
          reviewNotes: payload.notes ?? null,
          reviewerId: reviewer.id,
          reviewedAt: now,
          metadata: this.mergeMetadata(document.metadata, {
            reviewerLabel: reviewer.label,
            underReviewBy: null,
            underReviewById: null,
            underReviewAt: null,
            underReviewNotes: null,
          }),
        },
      }),
      this.prisma.adminReview.create({
        data: {
          type: AdminReviewTarget.DOCUMENT,
          status: AdminReviewStatus.APPROVED,
          targetId: document.id,
          targetLabel: document.name ?? 'identity_document',
          notes: payload.notes ?? null,
          reviewer: { connect: { id: reviewer.id } },
          document: { connect: { id: document.id } },
          metadata: {
            providerId,
            documentType: this.extractDocumentType(document),
          },
        },
      }),
      this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: {
          identityVerificationStatus: PrismaIdentityVerificationStatus.VERIFIED,
          identityVerificationReviewer: reviewer.label,
          identityVerificationReviewerId: reviewer.id,
          identityVerificationReviewedAt: now,
          identityVerifiedAt: now,
          identityVerificationNotes: payload.notes ?? null,
        },
      }),
    ]);

    await this.audit.log({
      providerId,
      documentId: document.id,
      actorId: reviewer.id,
      actorLabel: reviewer.label,
      action: 'APPROVED',
      payload: {
        documentType: this.extractDocumentType(document),
        notes: payload.notes ?? null,
      },
    });

    await this.notifyProvider(provider, 'approved', payload.notes);

    return this.getVerification(providerId);
  }

  async reject(providerId: string, payload: AdminIdentityRejectDto, reviewer: ReviewerContext) {
    const { document, provider } = await this.resolveDocument(providerId, payload.documentId);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: document.id },
        data: {
          reviewStatus: DocumentReviewStatus.REJECTED,
          reviewNotes: payload.reason,
          reviewerId: reviewer.id,
          reviewedAt: now,
          metadata: this.mergeMetadata(document.metadata, {
            reviewerLabel: reviewer.label,
            underReviewBy: null,
            underReviewById: null,
            underReviewAt: null,
            underReviewNotes: null,
          }),
        },
      }),
      this.prisma.adminReview.create({
        data: {
          type: AdminReviewTarget.DOCUMENT,
          status: AdminReviewStatus.REJECTED,
          targetId: document.id,
          targetLabel: document.name ?? 'identity_document',
          notes: payload.reason,
          reviewer: { connect: { id: reviewer.id } },
          document: { connect: { id: document.id } },
          metadata: {
            providerId,
            documentType: this.extractDocumentType(document),
          },
        },
      }),
      this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: {
          identityVerificationStatus: PrismaIdentityVerificationStatus.REJECTED,
          identityVerificationReviewer: reviewer.label,
          identityVerificationReviewerId: reviewer.id,
          identityVerificationReviewedAt: now,
          identityVerificationNotes: payload.reason,
          identityVerifiedAt: null,
        },
      }),
    ]);

    await this.audit.log({
      providerId,
      documentId: document.id,
      actorId: reviewer.id,
      actorLabel: reviewer.label,
      action: 'REJECTED',
      payload: {
        documentType: this.extractDocumentType(document),
        reason: payload.reason,
      },
    });

    await this.notifyProvider(provider, 'rejected', payload.reason);

    return this.getVerification(providerId);
  }

  async markUnderReview(
    providerId: string,
    payload: AdminIdentityUnderReviewDto,
    reviewer: ReviewerContext
  ) {
    const { document } = await this.resolveDocument(providerId, payload.documentId);
    const now = new Date();

    await this.prisma.document.update({
      where: { id: document.id },
      data: {
        reviewStatus: DocumentReviewStatus.UNDER_REVIEW,
        reviewNotes: payload.notes ?? null,
        reviewerId: reviewer.id,
        metadata: this.mergeMetadata(document.metadata, {
          reviewerLabel: reviewer.label,
          underReviewBy: reviewer.label,
          underReviewById: reviewer.id,
          underReviewAt: now.toISOString(),
          underReviewNotes: payload.notes ?? null,
        }),
      },
    });

    await this.audit.log({
      providerId,
      documentId: document.id,
      actorId: reviewer.id,
      actorLabel: reviewer.label,
      action: 'UNDER_REVIEW',
      payload: {
        documentType: this.extractDocumentType(document),
        notes: payload.notes ?? null,
      },
    });

    return this.getVerification(providerId);
  }

  async reset(providerId: string, payload: AdminIdentityResetDto, reviewer: ReviewerContext) {
    const reason = payload.reason?.trim();

    if (!reason || reason.length < 3) {
      throw new BadRequestException('RESET_REASON_REQUIRED');
    }

    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: { user: true },
    });
    if (!provider) {
      throw new NotFoundException('PROVIDER_NOT_FOUND');
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [];
    let resetDocument: Document | null = null;

    if (payload.documentId) {
      const resolved = await this.resolveDocument(providerId, payload.documentId);
      resetDocument = resolved.document;
      operations.push(
        this.prisma.document.update({
          where: { id: resolved.document.id },
          data: {
            reviewStatus: DocumentReviewStatus.PENDING,
            reviewNotes: null,
            reviewerId: null,
            reviewedAt: null,
            metadata: this.mergeMetadata(resolved.document.metadata, {
              reviewerLabel: null,
              underReviewBy: null,
              underReviewById: null,
              underReviewAt: null,
              underReviewNotes: null,
            }),
          },
        })
      );
    }

    operations.push(
      this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: {
          identityVerificationStatus: PrismaIdentityVerificationStatus.SUBMITTED,
          identityVerificationReviewer: reviewer.label,
          identityVerificationReviewerId: reviewer.id,
          identityVerificationReviewedAt: null,
          identityVerificationNotes: reason,
          identityVerifiedAt: null,
        },
      })
    );

    await this.prisma.$transaction(operations);

    await this.audit.log({
      providerId,
      documentId: payload.documentId,
      actorId: reviewer.id,
      actorLabel: reviewer.label,
      action: 'REQUESTED_DOCUMENT',
      payload: {
        reason,
        documentId: payload.documentId ?? undefined,
        documentType: resetDocument ? this.extractDocumentType(resetDocument) : undefined,
      },
    });

    await this.notifyProvider(provider, 'reset', reason);

    return this.getVerification(providerId);
  }

  private buildDocumentFilters(query: AdminIdentityVerificationsQueryDto) {
    const where: Prisma.DocumentWhereInput = {
      type: DocumentType.IDENTITY,
      providerId: { not: null },
    };

    const andFilters: Prisma.DocumentWhereInput[] = [];

    if (query.status) {
      const statuses = this.mapStatusFilter(query.status);
      if (statuses.length === 1) {
        where.reviewStatus = statuses[0];
      } else if (statuses.length > 1) {
        where.reviewStatus = { in: statuses };
      }
    }

    if (query.documentType) {
      const normalizedType = query.documentType.trim().toLowerCase();
      andFilters.push({
        metadata: {
          path: ['documentType'],
          equals: normalizedType,
        },
      });
    }

    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    if (query.search) {
      const search = query.search.trim();
      andFilters.push({
        OR: [
          { provider: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
          { provider: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
          { provider: { user: { email: { contains: search, mode: 'insensitive' } } } },
          { providerId: { equals: search } },
        ],
      });
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }
    return where;
  }

  private mapDocumentListItem(document: Document & { provider: ProviderProfile & { user?: User | null }; reviewer?: User | null }, typeIndex: Record<string, IdentityDocumentTypeConfig>): AdminIdentityVerificationListItem {
    const documentType = this.extractDocumentType(document);
    const providerStatus = (document.provider.identityVerificationStatus ?? PrismaIdentityVerificationStatus.NOT_STARTED).toLowerCase() as AdminIdentityVerificationListItem['currentStatus'];
    const definition = documentType ? typeIndex[documentType] : undefined;

    const metadata = this.pickDocumentMetadata(document);

    return {
      id: document.id,
      providerId: document.providerId!,
      providerName: this.composeName(document.provider.user) ?? document.providerId!,
      providerEmail: document.provider.user?.email ?? '',
      providerReference: document.providerId!,
      documentType: (documentType ?? 'id_card') as ProviderIdentityDocumentType,
      documentLabel: definition?.label.fr ?? documentType ?? 'Document',
      status: document.reviewStatus.toLowerCase() as AdminIdentityVerificationListItem['status'],
      submittedAt: document.createdAt.toISOString(),
      currentStatus: providerStatus,
      reviewer: document.reviewer ? this.composeName(document.reviewer) : undefined,
      reviewerId: document.reviewerId ?? undefined,
      reviewedAt: document.reviewedAt ? document.reviewedAt.toISOString() : undefined,
      metadata,
      underReviewAt: metadata?.underReviewAt,
      underReviewBy: metadata?.underReviewBy,
      underReviewById: metadata?.underReviewById,
      underReviewNotes: metadata?.underReviewNotes,
      reason: document.reviewNotes ?? undefined,
    };
  }

  private mapDocumentDetail(document: Document & { reviewer?: User | null }, provider: ProviderProfile, typeIndex: Record<string, IdentityDocumentTypeConfig>): AdminIdentityDocumentItem {
    const documentType = this.extractDocumentType(document);
    const definition = documentType ? typeIndex[documentType] : undefined;
    const reviewerName = document.reviewer ? this.composeName(document.reviewer) : undefined;
    const metadata = this.pickDocumentMetadata(document);

    return {
      id: document.id,
      name: document.name ?? definition?.label.fr ?? 'Document',
      documentType: (documentType ?? 'id_card') as ProviderIdentityDocumentType,
      documentLabel: definition?.label.fr ?? documentType ?? 'Document',
      url: document.url,
      downloadUrl: `/api/documents/${document.id}/download`,
      status: document.reviewStatus.toLowerCase() as AdminIdentityDocumentItem['status'],
      side: metadata?.side,
      mimeType: metadata?.mimeType,
      underReviewAt: metadata?.underReviewAt,
      underReviewBy: metadata?.underReviewBy,
      underReviewById: metadata?.underReviewById,
      underReviewNotes: metadata?.underReviewNotes,
      submittedAt: document.createdAt.toISOString(),
      reviewer: reviewerName,
      reviewerId: document.reviewerId ?? undefined,
      reviewedAt: document.reviewedAt ? document.reviewedAt.toISOString() : undefined,
      notes: document.reviewNotes ?? undefined,
    };
  }

  private indexDefinitions(definitions: IdentityDocumentTypeConfig[]) {
    return definitions.reduce<Record<string, IdentityDocumentTypeConfig>>((acc, entry) => {
      acc[entry.code] = entry;
      return acc;
    }, {});
  }

  private composeName(user?: User | null) {
    if (!user) {
      return undefined;
    }
    const base = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    if (base.length) {
      return base;
    }
    return user.email ?? undefined;
  }

  private pickDocumentMetadata(document: Document) {
    if (!document.metadata || typeof document.metadata !== 'object') {
      return undefined;
    }
    const metadata = document.metadata as Record<string, unknown>;
    const rawSide = typeof metadata['side'] === 'string' ? (metadata['side'] as string) : undefined;
    const allowedSides: ProviderIdentityDocumentSide[] = ['front', 'back', 'selfie'];
    const side = rawSide && allowedSides.includes(rawSide as ProviderIdentityDocumentSide) ? (rawSide as ProviderIdentityDocumentSide) : undefined;
    const underReviewBy = typeof metadata['underReviewBy'] === 'string' ? (metadata['underReviewBy'] as string) : undefined;
    const underReviewById =
      typeof metadata['underReviewById'] === 'string' ? (metadata['underReviewById'] as string) : undefined;
    const underReviewAtRaw = metadata['underReviewAt'];
    const underReviewAt =
      typeof underReviewAtRaw === 'string'
        ? underReviewAtRaw
        : underReviewAtRaw instanceof Date
        ? underReviewAtRaw.toISOString()
        : undefined;
    const underReviewNotes =
      typeof metadata['underReviewNotes'] === 'string' ? (metadata['underReviewNotes'] as string) : undefined;
    const mimeType = typeof metadata['mimeType'] === 'string' ? (metadata['mimeType'] as string) : undefined;
    return { side, underReviewBy, underReviewById, underReviewAt, underReviewNotes, mimeType };
  }

  private extractDocumentType(document: Document): ProviderIdentityDocumentType | undefined {
    if (document.metadata && typeof document.metadata === 'object') {
      const meta = document.metadata as Record<string, unknown>;
      const value = meta['documentType'];
      if (typeof value === 'string') {
        return value.toLowerCase() as ProviderIdentityDocumentType;
      }
    }
    return undefined;
  }

  private mergeMetadata(
    current: Prisma.JsonValue | null | undefined,
    extra: Record<string, Prisma.JsonValue>
  ): Prisma.JsonObject {
    const base =
      current && typeof current === 'object' && !Array.isArray(current)
        ? { ...(current as Record<string, Prisma.JsonValue>) }
        : {};
    return { ...base, ...extra };
  }

  private mapStatusFilter(status: string) {
    const normalized = status.toLowerCase();
    if (normalized === 'pending') {
      return [DocumentReviewStatus.PENDING, DocumentReviewStatus.UNDER_REVIEW];
    }
    if (normalized === 'under_review') {
      return [DocumentReviewStatus.UNDER_REVIEW];
    }
    if (normalized === 'approved') {
      return [DocumentReviewStatus.APPROVED];
    }
    if (normalized === 'rejected') {
      return [DocumentReviewStatus.REJECTED];
    }
    return [];
  }

  private async resolveDocument(providerId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        provider: { include: { user: true } },
      },
    });

    if (!document || document.providerId !== providerId || document.type !== DocumentType.IDENTITY || !document.provider) {
      throw new NotFoundException('IDENTITY_DOCUMENT_NOT_FOUND');
    }

    return { document, provider: document.provider };
  }

  private async notifyProvider(provider: ProviderProfile & { user?: User | null }, event: 'approved' | 'rejected' | 'reset', notes?: string) {
    if (!provider.userId) {
      return;
    }

    await this.notifications.emit({
      userIds: [provider.userId],
      type: NotificationType.IDENTITY_VERIFICATION,
      payload: {
        event,
        notes: notes ?? null,
        providerId: provider.id,
      },
    });
  }
}
