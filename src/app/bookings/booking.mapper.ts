import type {
  BookingRequest,
  BookingMode,
  CleaningFrequency,
  EcoPreference,
  ServiceCategory,
  BookingStatus,
  BookingAuditEntry,
} from '@saubio/models';
import {
  Booking as PrismaBooking,
  BookingAssignment,
  BookingMode as PrismaBookingMode,
  BookingStatus as PrismaBookingStatus,
  CleaningFrequency as PrismaCleaningFrequency,
  Document,
  EcoPreference as PrismaEcoPreference,
  ProviderTeam,
  ProviderTeamMember,
  User as PrismaUser,
} from '@prisma/client';

type BookingAuditEntity = {
  id: string;
  createdAt: Date;
  actorId: string | null;
  action: string;
  metadata: unknown;
};

export type BookingWithRelations = PrismaBooking & {
  assignments: BookingAssignment[];
  auditLog: BookingAuditEntity[];
  attachments: Document[];
  fallbackTeamCandidate: (ProviderTeam & { members: ProviderTeamMember[] }) | null;
  client?: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
};

export class BookingMapper {
  static toDomain(entity: BookingWithRelations): BookingRequest {
    return {
      id: entity.id,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      clientId: entity.clientId ?? null,
      companyId: entity.companyId ?? undefined,
      address: {
        streetLine1: entity.addressStreetLine1,
        streetLine2: entity.addressStreetLine2 ?? undefined,
        postalCode: entity.addressPostalCode,
        city: entity.addressCity,
        countryCode: entity.addressCountryCode,
        accessNotes: entity.addressAccessNotes ?? undefined,
      },
      service: BookingMapper.toDomainService(entity.service),
      surfacesSquareMeters: entity.surfacesSquareMeters,
      startAt: entity.startAt.toISOString(),
      endAt: entity.endAt.toISOString(),
      frequency: BookingMapper.toDomainFrequency(entity.frequency),
      mode: BookingMapper.toDomainMode(entity.mode),
      ecoPreference: BookingMapper.toDomainEcoPreference(entity.ecoPreference),
      requiredProviders: entity.requiredProviders ?? 1,
      preferredTeamId: entity.preferredTeamId ?? undefined,
      assignedTeamId: entity.assignedTeamId ?? undefined,
      providerIds: entity.assignments.map((assignment) => assignment.providerId),
      attachments: (entity.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        type: attachment.type.toLowerCase() as BookingRequest['attachments'][number]['type'],
        url: attachment.url,
        uploadedAt: attachment.createdAt.toISOString(),
        name: attachment.name ?? undefined,
        metadata: typeof attachment.metadata === 'object' && attachment.metadata !== null ? (attachment.metadata as Record<string, unknown>) : undefined,
      })),
      notes: entity.notes ?? undefined,
      opsNotes: entity.opsNotes ?? undefined,
      providerNotes: entity.providerNotes ?? undefined,
      reminderAt: entity.reminderAt ? entity.reminderAt.toISOString() : null,
      reminderNotes: entity.reminderNotes ?? undefined,
      status: BookingMapper.toDomainStatus(entity.status),
      pricing: {
        subtotalCents: entity.pricingSubtotalCents,
        ecoSurchargeCents: entity.pricingEcoCents,
        loyaltyCreditsCents: entity.pricingLoyaltyCents ?? 0,
        extrasCents: entity.pricingExtrasCents,
        taxCents: entity.pricingTaxCents,
        currency: entity.pricingCurrency as 'EUR',
        totalCents: entity.pricingTotalCents,
      },
      auditLog: entity.auditLog.map((entry) => ({
        timestamp: entry.createdAt.toISOString(),
        actorId: entry.actorId ?? undefined,
        action: BookingMapper.toDomainAuditAction(entry.action),
        metadata: BookingMapper.normalizeMetadata(entry.metadata),
      })),
      matchingRetryCount: entity.matchingRetryCount ?? 0,
      fallbackRequestedAt: entity.fallbackRequestedAt ? entity.fallbackRequestedAt.toISOString() : null,
      fallbackEscalatedAt: entity.fallbackEscalatedAt ? entity.fallbackEscalatedAt.toISOString() : null,
      fallbackTeamCandidate: entity.fallbackTeamCandidate
        ? {
            id: entity.fallbackTeamCandidate.id,
            name: entity.fallbackTeamCandidate.name,
            preferredSize: entity.fallbackTeamCandidate.preferredSize ?? undefined,
            memberCount: entity.fallbackTeamCandidate.members.length,
          }
        : null,
      leadTimeDays: entity.leadTimeDays ?? undefined,
      shortNotice: entity.shortNotice ?? undefined,
      shortNoticeDepositCents: entity.shortNoticeDepositCents ?? undefined,
    };
  }

  static toDomainService(service: string): ServiceCategory {
    const known: ServiceCategory[] = [
      'residential',
      'office',
      'industrial',
      'windows',
      'disinfection',
      'eco_plus',
    ];
    if (known.includes(service as ServiceCategory)) {
      return service as ServiceCategory;
    }

    return 'residential';
  }

  static toPrismaMode(mode: BookingMode): PrismaBookingMode {
    return mode === 'manual' ? PrismaBookingMode.MANUAL : PrismaBookingMode.SMART_MATCH;
  }

  static toDomainMode(mode: PrismaBookingMode): BookingMode {
    return mode === PrismaBookingMode.MANUAL ? 'manual' : 'smart_match';
  }

  static toPrismaFrequency(frequency: CleaningFrequency): PrismaCleaningFrequency {
    switch (frequency) {
      case 'biweekly':
        return PrismaCleaningFrequency.BIWEEKLY;
      case 'monthly':
        return PrismaCleaningFrequency.MONTHLY;
      case 'contract':
        return PrismaCleaningFrequency.CONTRACT;
      case 'weekly':
        return PrismaCleaningFrequency.WEEKLY;
      case 'once':
      default:
        return PrismaCleaningFrequency.ONCE;
    }
  }

  static toDomainFrequency(frequency: PrismaCleaningFrequency): CleaningFrequency {
    switch (frequency) {
      case PrismaCleaningFrequency.BIWEEKLY:
        return 'biweekly';
      case PrismaCleaningFrequency.MONTHLY:
        return 'monthly';
      case PrismaCleaningFrequency.CONTRACT:
        return 'contract';
      case PrismaCleaningFrequency.WEEKLY:
        return 'weekly';
      case PrismaCleaningFrequency.ONCE:
      default:
        return 'once';
    }
  }

  static toPrismaEcoPreference(eco: EcoPreference | 'all'): PrismaEcoPreference | undefined {
    if (eco === 'all') {
      return undefined;
    }
    return eco === 'bio' ? PrismaEcoPreference.BIO : PrismaEcoPreference.STANDARD;
  }

  static toDomainEcoPreference(eco: PrismaEcoPreference): EcoPreference {
    return eco === PrismaEcoPreference.BIO ? 'bio' : 'standard';
  }

  static toPrismaStatus(status: BookingStatus): PrismaBookingStatus {
    switch (status) {
      case 'pending_provider':
        return PrismaBookingStatus.PENDING_PROVIDER;
      case 'pending_client':
        return PrismaBookingStatus.PENDING_CLIENT;
      case 'confirmed':
        return PrismaBookingStatus.CONFIRMED;
      case 'in_progress':
        return PrismaBookingStatus.IN_PROGRESS;
      case 'completed':
        return PrismaBookingStatus.COMPLETED;
      case 'cancelled':
        return PrismaBookingStatus.CANCELLED;
      case 'disputed':
        return PrismaBookingStatus.DISPUTED;
      case 'draft':
      default:
        return PrismaBookingStatus.DRAFT;
    }
  }

  static toDomainStatus(status: PrismaBookingStatus): BookingStatus {
    switch (status) {
      case PrismaBookingStatus.PENDING_PROVIDER:
        return 'pending_provider';
      case PrismaBookingStatus.PENDING_CLIENT:
        return 'pending_client';
      case PrismaBookingStatus.CONFIRMED:
        return 'confirmed';
      case PrismaBookingStatus.IN_PROGRESS:
        return 'in_progress';
      case PrismaBookingStatus.COMPLETED:
        return 'completed';
      case PrismaBookingStatus.CANCELLED:
        return 'cancelled';
      case PrismaBookingStatus.DISPUTED:
        return 'disputed';
      case PrismaBookingStatus.DRAFT:
      default:
        return 'draft';
    }
  }

  static toDomainAuditAction(action: string): BookingAuditEntry['action'] {
    const allowed: BookingAuditEntry['action'][] = [
      'created',
      'updated',
      'provider_assigned',
      'provider_removed',
      'status_changed',
      'note_updated',
      'reminder_scheduled',
      'attachment_uploaded',
      'customer_notified',
      'invoice_generated',
      'payment_captured',
    ];

    if (allowed.includes(action as BookingAuditEntry['action'])) {
      return action as BookingAuditEntry['action'];
    }

    return 'updated';
  }

  static normalizeMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }

    if (typeof metadata === 'object' && metadata !== null) {
      return metadata as Record<string, unknown>;
    }

    return { value: metadata };
  }
}
