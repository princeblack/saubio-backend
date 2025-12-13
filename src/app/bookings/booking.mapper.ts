import type {
  BookingRequest,
  BookingMode,
  CleaningFrequency,
  EcoPreference,
  ServiceCategory,
  BookingStatus,
  BookingAuditEntry,
  CleaningSoilLevel,
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
  SoilLevel as PrismaSoilLevel,
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
      billingAddress: BookingMapper.buildAddress(
        entity.billingStreetLine1,
        entity.billingStreetLine2,
        entity.billingPostalCode,
        entity.billingCity,
        entity.billingCountryCode ?? entity.addressCountryCode,
        entity.billingAccessNotes
      ),
      contact: BookingMapper.buildContactDetails({
        firstName: entity.contactFirstName,
        lastName: entity.contactLastName,
        company: entity.contactCompany,
        phone: entity.contactPhone,
        address: BookingMapper.buildAddress(
          entity.contactStreetLine1,
          entity.contactStreetLine2,
          entity.contactPostalCode,
          entity.contactCity,
          entity.contactCountryCode ?? entity.addressCountryCode,
          entity.contactAccessNotes
        ),
      }),
      onsiteContact: BookingMapper.buildContactDetails({
        firstName: entity.onsiteContactFirstName,
        lastName: entity.onsiteContactLastName,
        phone: entity.onsiteContactPhone,
      }),
      service: BookingMapper.toDomainService(entity.service),
      surfacesSquareMeters:
        entity.surfacesSquareMeters !== null && entity.surfacesSquareMeters !== undefined
          ? Number(entity.surfacesSquareMeters)
          : undefined,
      durationHours:
        entity.durationHours !== null && entity.durationHours !== undefined
          ? Number(entity.durationHours)
          : undefined,
      recommendedHours:
        entity.recommendedHours !== null && entity.recommendedHours !== undefined
          ? Number(entity.recommendedHours)
          : undefined,
      durationManuallyAdjusted: entity.durationManuallyAdjusted ?? undefined,
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
      couponCode: entity.couponCode ?? undefined,
      servicePreferences: BookingMapper.buildServicePreferences(entity),
    };
  }

  private static buildAddress(
    streetLine1?: string | null,
    streetLine2?: string | null,
    postalCode?: string | null,
    city?: string | null,
    countryCode?: string | null,
    accessNotes?: string | null
  ): BookingRequest['address'] | undefined {
    if (!streetLine1 || !postalCode || !city || !countryCode) {
      return undefined;
    }
    return {
      streetLine1,
      streetLine2: streetLine2 ?? undefined,
      postalCode,
      city,
      countryCode,
      accessNotes: accessNotes ?? undefined,
    };
  }

  private static buildContactDetails(params: {
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    phone?: string | null;
    address?: BookingRequest['address'];
  }): BookingRequest['contact'] {
    const hasIdentity =
      Boolean(params.firstName) ||
      Boolean(params.lastName) ||
      Boolean(params.company) ||
      Boolean(params.phone) ||
      Boolean(params.address);
    if (!hasIdentity) {
      return undefined;
    }
    return {
      firstName: params.firstName ?? undefined,
      lastName: params.lastName ?? undefined,
      company: params.company ?? undefined,
      phone: params.phone ?? undefined,
      address: params.address,
    };
  }

  private static buildServicePreferences(entity: PrismaBooking): BookingRequest['servicePreferences'] {
    const soilLevel = BookingMapper.toDomainSoilLevel(entity.soilLevel);
    const rawCleaning =
      typeof entity.cleaningPreferences === 'object' && entity.cleaningPreferences !== null
        ? (entity.cleaningPreferences as { wishes?: unknown })
        : undefined;
    const rawUpholstery =
      typeof entity.upholsteryDetails === 'object' && entity.upholsteryDetails !== null
        ? (entity.upholsteryDetails as { quantities?: Record<string, unknown>; addons?: unknown })
        : undefined;

    const wishes = Array.isArray(rawCleaning?.wishes)
      ? rawCleaning?.wishes
          .map((wish) => (typeof wish === 'string' ? wish : null))
          .filter((wish): wish is string => Boolean(wish))
      : [];

    const quantities = rawUpholstery?.quantities
      ? Object.entries(rawUpholstery.quantities)
          .map(([key, value]) => [key, Number(value)] as const)
          .filter(([, value]) => Number.isFinite(value) && value > 0)
          .reduce<Record<string, number>>((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {})
      : {};

    const addons = Array.isArray(rawUpholstery?.addons)
      ? rawUpholstery.addons
          .map((addon) => (typeof addon === 'string' ? addon : null))
          .filter((addon): addon is string => Boolean(addon))
      : [];

    const hasPreferences =
      soilLevel ||
      wishes.length > 0 ||
      Object.keys(quantities).length > 0 ||
      addons.length > 0 ||
      Boolean(entity.additionalInstructions);

    if (!hasPreferences) {
      return undefined;
    }

    return {
      soilLevel: soilLevel ?? undefined,
      wishes: wishes.length ? wishes : undefined,
      upholstery:
        Object.keys(quantities).length || addons.length
          ? {
              quantities: Object.keys(quantities).length ? quantities : undefined,
              addons: addons.length ? addons : undefined,
            }
          : undefined,
      additionalInstructions: entity.additionalInstructions ?? undefined,
    };
  }

  private static toDomainSoilLevel(level?: PrismaSoilLevel | null): CleaningSoilLevel | undefined {
    switch (level) {
      case PrismaSoilLevel.LIGHT:
        return 'light';
      case PrismaSoilLevel.NORMAL:
        return 'normal';
      case PrismaSoilLevel.STRONG:
        return 'strong';
      case PrismaSoilLevel.EXTREME:
        return 'extreme';
      default:
        return undefined;
    }
  }

  static toDomainService(service: string): ServiceCategory {
    const known: ServiceCategory[] = [
      'residential',
      'office',
      'industrial',
      'windows',
      'disinfection',
      'eco_plus',
      'carpet',
      'upholstery',
      'spring',
      'final',
      'cluttered',
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
      case 'last_minute':
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
