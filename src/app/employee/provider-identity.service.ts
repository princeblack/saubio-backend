import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AdminReviewStatus,
  AdminReviewTarget,
  Document,
  DocumentReviewStatus,
  DocumentType,
  IdentityVerificationStatus as PrismaIdentityVerificationStatus,
  ProviderProfile as PrismaProviderProfile,
  Prisma,
  User as PrismaUser,
} from '@prisma/client';
import type { AdminProviderIdentityReview, ProviderIdentityDocumentSummary } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewProviderIdentityDto } from './dto/review-provider-identity.dto';

@Injectable()
export class EmployeeProviderIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: PrismaIdentityVerificationStatus): Promise<AdminProviderIdentityReview[]> {
    const where: Prisma.ProviderProfileWhereInput = status
      ? { identityVerificationStatus: status }
      : {
          identityVerificationStatus: { not: PrismaIdentityVerificationStatus.VERIFIED },
        };

    const providers = await this.prisma.providerProfile.findMany({
      where,
      include: {
        user: true,
        documents: {
          where: { type: DocumentType.IDENTITY },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: [{ identityVerificationStatus: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    return providers.map((provider) => this.mapProvider(provider));
  }

  async get(providerId: string): Promise<AdminProviderIdentityReview> {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: {
        user: true,
        documents: {
          where: { type: DocumentType.IDENTITY },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('PROVIDER_NOT_FOUND');
    }

    return this.mapProvider(provider);
  }

  async review(
    providerId: string,
    payload: ReviewProviderIdentityDto,
    reviewer: { id: string; label: string }
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: payload.documentId },
    });

    if (!document || document.providerId !== providerId || document.type !== DocumentType.IDENTITY) {
      throw new NotFoundException('IDENTITY_DOCUMENT_NOT_FOUND');
    }

    const now = new Date();
    const status =
      payload.status === 'verified' ? DocumentReviewStatus.APPROVED : DocumentReviewStatus.REJECTED;

    await this.prisma.document.update({
      where: { id: document.id },
      data: {
        reviewStatus: status,
        reviewNotes: payload.notes ?? null,
        reviewer: { connect: { id: reviewer.id } },
        reviewedAt: now,
        metadata: this.mergeMetadata(document.metadata, { reviewerLabel: reviewer.label }),
      },
    });

    await this.prisma.adminReview.create({
      data: {
        type: AdminReviewTarget.DOCUMENT,
        status: payload.status === 'verified' ? AdminReviewStatus.APPROVED : AdminReviewStatus.REJECTED,
        targetId: document.id,
        targetLabel: document.name ?? 'identity_document',
        notes: payload.notes ?? null,
        reviewer: { connect: { id: reviewer.id } },
        document: { connect: { id: document.id } },
        metadata: {
          providerId,
          documentType: document.type,
          reviewerLabel: reviewer.label,
        },
      },
    });

    await this.prisma.providerProfile.update({
      where: { id: providerId },
      data: {
        identityVerificationStatus:
          payload.status === 'verified'
            ? PrismaIdentityVerificationStatus.VERIFIED
            : PrismaIdentityVerificationStatus.REJECTED,
        identityVerificationNotes: payload.notes ?? null,
        identityVerificationReviewer: reviewer.label,
        identityVerificationReviewedAt: now,
        identityVerifiedAt: payload.status === 'verified' ? now : null,
      },
    });

    return this.get(providerId);
  }

  async completeWelcomeSession(providerId: string, reviewer: string) {
    const updated = await this.prisma.providerProfile.update({
      where: { id: providerId },
      data: {
        welcomeSessionCompletedAt: new Date(),
        identityVerificationReviewer: reviewer,
      },
      include: {
        user: true,
        documents: {
          where: { type: DocumentType.IDENTITY },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    return this.mapProvider(updated);
  }

  private mapProvider(
    provider: PrismaProviderProfile & { user: PrismaUser; documents: Document[] }
  ): AdminProviderIdentityReview {
    return {
      providerId: provider.id,
      name: this.composeName(provider.user.firstName, provider.user.lastName),
      email: provider.user.email,
      status: provider.identityVerificationStatus.toLowerCase() as AdminProviderIdentityReview['status'],
      reviewer: provider.identityVerificationReviewer ?? undefined,
      reviewedAt: provider.identityVerificationReviewedAt
        ? provider.identityVerificationReviewedAt.toISOString()
        : undefined,
      verifiedAt: provider.identityVerifiedAt ? provider.identityVerifiedAt.toISOString() : undefined,
      notes: provider.identityVerificationNotes ?? undefined,
      welcomeSessionCompletedAt: provider.welcomeSessionCompletedAt
        ? provider.welcomeSessionCompletedAt.toISOString()
        : undefined,
      documents: provider.documents.map((doc) => this.mapDocument(doc)),
    };
  }

  private mapDocument(document: Document & { metadata: Prisma.JsonValue | null }): ProviderIdentityDocumentSummary {
    const metadata =
      document.metadata && typeof document.metadata === 'object'
        ? (document.metadata as Record<string, unknown>)
        : {};
    const status: ProviderIdentityDocumentSummary['status'] =
      document.reviewStatus === DocumentReviewStatus.APPROVED
        ? 'verified'
        : document.reviewStatus === DocumentReviewStatus.REJECTED
          ? 'rejected'
          : 'submitted';
    const reviewedAt = document.reviewedAt ? document.reviewedAt.toISOString() : undefined;
    const reviewerLabel =
      typeof metadata['reviewerLabel'] === 'string' ? (metadata['reviewerLabel'] as string) : undefined;

    return {
      id: document.id,
      name: document.name ?? 'Pièce d’identité',
      url: document.url,
      uploadedAt: document.createdAt.toISOString(),
      documentType: (metadata.documentType as ProviderIdentityDocumentSummary['documentType']) ?? 'passport',
      status,
      reviewer: reviewerLabel ?? document.reviewerId ?? undefined,
      reviewedAt,
      notes: document.reviewNotes ?? undefined,
    };
  }

  private mergeMetadata(metadata: Prisma.JsonValue | null, extra: Record<string, unknown>) {
    const base =
      metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
    return { ...base, ...extra } as Prisma.JsonObject;
  }

  private composeName(firstName?: string | null, lastName?: string | null) {
    return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Prestataire Saubio';
  }
}
