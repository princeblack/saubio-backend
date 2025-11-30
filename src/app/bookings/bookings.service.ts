import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BookingMode,
  BookingRequest,
  BookingStatus,
  CleaningFrequency,
  EcoPreference,
  ProviderSuggestion,
  ServiceCategory,
  User,
} from '@saubio/models';
import {
  Booking as PrismaBooking,
  BookingAssignment,
  BookingTeamLock,
  BookingTeamLockStatus,
  BookingInvitationStatus,
  DocumentType,
  NotificationType,
  Prisma,
  BookingStatus as PrismaBookingStatus,
  BookingMode as PrismaBookingMode,
  ProviderTeam,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CancelBookingDto,
  CreateBookingDto,
  CreateGuestBookingDto,
  ListBookingsQueryDto,
  ProviderSearchDto,
  UpdateBookingDto,
} from './dto';
import { BookingMatchingService, BookingMatchingCriteria } from './booking-matching.service';
import { BookingMapper, type BookingWithRelations } from './booking.mapper';
import { BookingNotificationsService } from './booking-notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';

type BookingCreationResponse = BookingRequest & {
  paymentIntentClientSecret?: string;
  setupIntentClientSecret?: string;
};

type BookingLockSnapshot = BookingTeamLock & {
  provider?: {
    id: string;
  } | null;
  providerTeam?: ProviderTeam & {
    members: Array<{ providerId: string; isLead: boolean; orderIndex: number }>;
  } | null;
};

type BookingWithLockState = BookingWithRelations & {
  bookingLocks: BookingLockSnapshot[];
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private static readonly MAX_MATCHING_RETRY_ATTEMPTS = 3;
  private static readonly SHORT_NOTICE_WINDOW_DAYS = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: BookingMatchingService,
    private readonly bookingNotifications: BookingNotificationsService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly pricingEngine: PricingService
  ) {}

  @Cron('*/5 * * * *')
  async retryPendingProviderAssignments() {
    const threshold = new Date(Date.now() - 5 * 60 * 1000);
    const now = new Date();
    const pending = (await this.prisma.booking.findMany({
      where: {
        status: PrismaBookingStatus.PENDING_PROVIDER,
        mode: PrismaBookingMode.SMART_MATCH,
        updatedAt: { lt: threshold },
        startAt: { gt: now },
      },
      take: 5,
      orderBy: { updatedAt: 'asc' },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    })) as BookingWithRelations[];

    for (const booking of pending) {
      try {
        await this.retrySmartMatching(booking);
      } catch (error) {
        this.logger.warn(
          `Retry matching failed for booking ${booking.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  @Cron('*/2 * * * *')
  async promoteConfirmedLocksJob() {
    const now = new Date();
    const candidates = (await this.prisma.booking.findMany({
      where: {
        status: PrismaBookingStatus.PENDING_PROVIDER,
        assignments: { none: {} },
        bookingLocks: {
          some: { status: BookingTeamLockStatus.CONFIRMED, expiresAt: { gt: now } },
        },
      },
      take: 5,
      orderBy: { startAt: 'asc' },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
        bookingLocks: {
          where: { status: BookingTeamLockStatus.CONFIRMED, expiresAt: { gt: now } },
          orderBy: { createdAt: 'asc' },
          include: {
            provider: { select: { id: true } },
            providerTeam: {
              include: {
                members: {
                  orderBy: { orderIndex: 'asc' },
                  select: { providerId: true, orderIndex: true, isLead: true },
                },
              },
            },
          },
        },
      },
    })) as BookingWithLockState[];

    for (const booking of candidates) {
      try {
        await this.promoteLocksForBooking(booking);
      } catch (error) {
        this.logger.warn(
          `Lock promotion failed for booking ${booking.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  @Cron('*/3 * * * *')
  async releaseExpiredLocksJob() {
    const now = new Date();
    const expired = await this.prisma.bookingTeamLock.findMany({
      where: {
        status: { in: [BookingTeamLockStatus.HELD, BookingTeamLockStatus.CONFIRMED] },
        expiresAt: { lt: now },
        booking: { status: PrismaBookingStatus.PENDING_PROVIDER },
      },
      orderBy: { expiresAt: 'asc' },
      take: 25,
      include: {
        teamPlanSlot: { select: { id: true, teamPlanId: true } },
      },
    });

    if (!expired.length) {
      return;
    }

    await this.releaseLockBatch(expired);
  }

  async findAll(user: User, filters?: ListBookingsQueryDto): Promise<BookingRequest[]> {
    const providerProfile = await this.getProviderProfileId(user.id);
    const baseWhere = await this.buildAccessFilter(user, providerProfile);
    const where: Prisma.BookingWhereInput = baseWhere ? { ...baseWhere } : {};

    if (filters?.status) {
      where.status = BookingMapper.toPrismaStatus(filters.status);
    }
    if (filters?.mode) {
      where.mode = BookingMapper.toPrismaMode(filters.mode);
    }
    if (filters?.fallbackRequested !== undefined) {
      where.fallbackRequestedAt = filters.fallbackRequested ? { not: null } : { equals: null };
    }
    if (filters?.fallbackEscalated !== undefined) {
      where.fallbackEscalatedAt = filters.fallbackEscalated ? { not: null } : { equals: null };
    }
    if (typeof filters?.minRetryCount === 'number') {
      where.matchingRetryCount = { gte: filters.minRetryCount };
    }

    const bookings = await this.prisma.booking.findMany({
      ...(Object.keys(where).length ? { where } : {}),
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    return bookings.map((booking) => BookingMapper.toDomain(booking));
  }

  async findOne(id: string, user: User): Promise<BookingRequest> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    await this.assertBookingAccess(user, booking);

    return BookingMapper.toDomain(booking);
  }

  async listProviderSuggestions(filters: ProviderSearchDto, user: User): Promise<ProviderSuggestion[]> {
    if (!this.isClient(user) && !this.isCompany(user) && !this.isElevated(user)) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    const scheduleError = this.validateChronology(filters.startAt, filters.endAt);
    if (scheduleError) {
      throw new BadRequestException(scheduleError);
    }

    const criteria = this.buildMatchingCriteria({
      service: filters.service,
      ecoPreference: filters.ecoPreference ?? 'standard',
      startAt: filters.startAt,
      endAt: filters.endAt,
      city: filters.city,
      clientId: this.isClient(user) || this.isCompany(user) ? user.id : undefined,
      requiredProviders: 1,
    });
    const matchingContextKey = this.buildMatchingContextKey(filters);
    await this.emitMatchingProgress(user.id, {
      stage: 'suggestions',
      status: 'started',
      contextKey: matchingContextKey,
      city: filters.city,
      service: filters.service,
    });

    const providerIds = await this.matching.matchProviders(criteria, filters.limit ?? 6);
    await this.emitMatchingProgress(user.id, {
      stage: 'suggestions',
      status: 'completed',
      contextKey: matchingContextKey,
      count: providerIds.length,
    });
    if (!providerIds.length) {
      await this.emitMatchingProgress(user.id, {
        stage: 'team',
        status: 'pending',
        contextKey: matchingContextKey,
      });
      return [];
    }

    const profiles = await this.prisma.providerProfile.findMany({
      where: {
        id: { in: providerIds },
        ...(filters.ecoPreference === 'bio' ? { offersEco: true } : {}),
        serviceCategories: { has: filters.service },
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        documents: {
          where: { type: DocumentType.PHOTO_BEFORE },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const order = new Map(providerIds.map((id, index) => [id, index]));

    return profiles
      .map<ProviderSuggestion>((profile) => ({
        id: profile.id,
        displayName: `${profile.user.firstName} ${profile.user.lastName}`,
        type: profile.providerType.toLowerCase() as ProviderSuggestion['type'],
        hourlyRateCents: profile.hourlyRateCents,
        ratingAverage: profile.ratingAverage ?? null,
        ratingCount: profile.ratingCount ?? 0,
        offersEco: profile.offersEco,
        languages: profile.languages,
        serviceAreas: profile.serviceAreas,
        serviceCategories: profile.serviceCategories as ServiceCategory[],
        yearsExperience: profile.yearsExperience ?? undefined,
        bio: profile.bio ?? undefined,
        photoUrl: profile.documents[0]?.url,
      }))
      .sort((a, b) => {
        const aIndex = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });
  }

  private buildMatchingContextKey(filters: {
    service: ServiceCategory;
    city?: string;
    postalCode?: string;
    startAt: string;
    endAt: string;
    ecoPreference?: EcoPreference | 'standard';
  }): string {
    return [
      filters.service,
      (filters.city ?? '').trim().toLowerCase(),
      (filters.postalCode ?? '').trim().toLowerCase(),
      filters.startAt,
      filters.endAt,
      filters.ecoPreference ?? 'standard',
    ].join('|');
  }

  private async emitMatchingProgress(userId: string, payload: Record<string, unknown>) {
    try {
      await this.notifications.emit({
        type: NotificationType.MATCHING_PROGRESS,
        userIds: [userId],
        payload,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit matching progress event: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  async create(payload: CreateBookingDto, user: User): Promise<BookingCreationResponse> {
    const clientId = this.resolveClientId(payload.clientId, user);
    return this.createBookingRecord(payload, {
      actorUser: user,
      clientId,
    });
  }

  async createGuestDraft(payload: CreateGuestBookingDto): Promise<BookingCreationResponse> {
    const { guestToken, ...bookingPayload } = payload;
    return this.createBookingRecord(bookingPayload as CreateBookingDto, {
      actorUser: null,
      clientId: null,
      guestToken,
    });
  }

  async claimGuestBooking(id: string, guestToken: string, user: User): Promise<BookingRequest> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    if (booking.clientId && booking.clientId !== user.id) {
      throw new ConflictException('BOOKING_ALREADY_ASSIGNED');
    }

    if (!booking.guestToken || booking.guestToken !== guestToken) {
      throw new BadRequestException('BOOKING_CLAIM_INVALID');
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        client: { connect: { id: user.id } },
        guestToken: null,
        claimedAt: new Date(),
      },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    return BookingMapper.toDomain(updated as BookingWithRelations);
  }

  private async createBookingRecord(
    payload: CreateBookingDto,
    options: { actorUser: User | null; clientId: string | null; guestToken?: string | null }
  ): Promise<BookingCreationResponse> {
    const actorUser = options.actorUser ?? null;
    const actorId = actorUser?.id ?? null;
    const clientId = options.clientId ?? null;
    const dateValidationError = this.validateChronology(payload.startAt, payload.endAt);
    if (dateValidationError) {
      throw new BadRequestException(dateValidationError);
    }

    const pricing = await this.calculatePricing({
      surfacesSquareMeters: payload.surfacesSquareMeters,
      ecoPreference: payload.ecoPreference,
      clientId: clientId ?? undefined,
    });

    const matchingCriteria = this.buildMatchingCriteria({
      service: payload.service,
      ecoPreference: payload.ecoPreference,
      startAt: payload.startAt,
      endAt: payload.endAt,
      city: payload.address.city,
      clientId: clientId ?? undefined,
      priceCeilingCents: pricing.subtotalCents,
      requiredProviders: payload.requiredProviders ?? 1,
    });
    const matchingContextKey = this.buildMatchingContextKey({
      service: payload.service,
      city: payload.address.city,
      postalCode: payload.address.postalCode,
      startAt: payload.startAt,
      endAt: payload.endAt,
      ecoPreference: payload.ecoPreference,
    });

    if (actorId) {
      await this.emitMatchingProgress(actorId, {
        stage: 'booking',
        status: 'started',
        contextKey: matchingContextKey,
      });
    }

    const leadTimeDays = this.calculateLeadTimeDays(payload.startAt);
    const isShortNotice =
      payload.shortNotice ?? (leadTimeDays <= BookingsService.SHORT_NOTICE_WINDOW_DAYS);
    const normalizedMode: BookingMode = isShortNotice ? 'smart_match' : payload.mode;
    const assignmentInput: CreateBookingDto = { ...payload, mode: normalizedMode };
    const assignmentPlan = isShortNotice
      ? { providerIds: [], requiredProviders: assignmentInput.requiredProviders ?? 1 }
      : await this.buildAssignmentPlan(assignmentInput, matchingCriteria);
    const normalizedProviderIds = assignmentPlan.providerIds;
    const status = this.resolveInitialStatus({ mode: normalizedMode, providerIds: normalizedProviderIds });
    const attachmentInput = this.buildAttachmentInput(payload.attachments ?? [], actorId);
    const depositHoldCents = isShortNotice
      ? this.resolveShortNoticeDeposit({
          estimated: payload.estimatedDepositCents,
          pricingTotalCents: pricing.totalCents,
        })
      : null;

    const booking = await this.prisma.booking.create({
      data: {
        client: clientId ? { connect: { id: clientId } } : undefined,
        guestToken: options.guestToken ?? null,
        company: payload.companyId ? { connect: { id: payload.companyId } } : undefined,
        service: payload.service,
        surfacesSquareMeters: payload.surfacesSquareMeters,
        startAt: new Date(payload.startAt),
        endAt: new Date(payload.endAt),
        frequency: BookingMapper.toPrismaFrequency(payload.frequency),
        mode: BookingMapper.toPrismaMode(normalizedMode),
        ecoPreference: BookingMapper.toPrismaEcoPreference(payload.ecoPreference),
        addressStreetLine1: payload.address.streetLine1,
        addressStreetLine2: payload.address.streetLine2,
        addressPostalCode: payload.address.postalCode,
        addressCity: payload.address.city,
        addressCountryCode: payload.address.countryCode,
        addressAccessNotes: payload.address.accessNotes,
        status: BookingMapper.toPrismaStatus(status),
        pricingSubtotalCents: pricing.subtotalCents,
        pricingEcoCents: pricing.ecoSurchargeCents,
        pricingLoyaltyCents: pricing.loyaltyCreditsCents,
        pricingExtrasCents: pricing.extrasCents,
        pricingTaxCents: pricing.taxCents,
        pricingCurrency: pricing.currency,
        pricingTotalCents: pricing.totalCents,
        notes: payload.notes,
        opsNotes: payload.opsNotes,
        providerNotes: payload.providerNotes,
        reminderAt: payload.reminderAt ? new Date(payload.reminderAt) : undefined,
        reminderNotes: payload.reminderNotes,
        requiredProviders: assignmentPlan.requiredProviders,
        preferredTeam: assignmentPlan.preferredTeamId
          ? { connect: { id: assignmentPlan.preferredTeamId } }
          : undefined,
        assignedTeam: assignmentPlan.teamId
          ? { connect: { id: assignmentPlan.teamId } }
          : undefined,
        assignments: normalizedProviderIds.length
          ? {
              create: normalizedProviderIds.map((providerId) => ({
                provider: { connect: { id: providerId } },
                team: assignmentPlan.teamId ? { connect: { id: assignmentPlan.teamId } } : undefined,
              })),
            }
          : undefined,
        attachments: attachmentInput.length
          ? {
              create: attachmentInput,
            }
          : undefined,
        auditLog: {
          create: {
            actor: actorId ? { connect: { id: actorId } } : undefined,
            action: 'created',
            metadata: {
              status,
              providerIds: normalizedProviderIds,
              teamId: assignmentPlan.teamId ?? assignmentPlan.preferredTeamId ?? null,
              shortNotice: isShortNotice,
              leadTimeDays,
            },
          },
        },
        shortNotice: isShortNotice,
        leadTimeDays,
        shortNoticeDepositCents: depositHoldCents ?? null,
      },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    let paymentSecrets:
      | {
          paymentIntentClientSecret?: string | null;
          setupIntentClientSecret?: string | null;
          checkoutUrl?: string | null;
        }
      | null = null;
    const shouldInitializePayment =
      Boolean(clientId) &&
      (normalizedProviderIds.length > 0 || (isShortNotice && (depositHoldCents ?? 0) > 0));
    if (shouldInitializePayment && actorUser) {
      try {
        paymentSecrets = await this.payments.initializeBookingPayment({
          bookingId: booking.id,
          client: {
            id: clientId!,
            email: actorUser.email,
            firstName: actorUser.firstName,
            lastName: actorUser.lastName,
          },
          amountCents:
            normalizedProviderIds.length > 0
              ? pricing.totalCents
              : depositHoldCents ?? pricing.totalCents,
          currency: pricing.currency,
        });
      } catch (error) {
        this.logger.error('Failed to initialize payment intent', error instanceof Error ? error.stack : undefined);
      }
    }

    const bookingWithRelations = booking as BookingWithRelations;

    if (actorId) {
      await this.bookingNotifications.notifyParticipants({
        booking: bookingWithRelations,
        type: NotificationType.BOOKING_STATUS,
        payload: {
          event: 'created',
          status,
          actorId,
        },
      });
    }

    const statusStage = this.resolveMatchingStageFromStatus(status);
    if (statusStage && actorId) {
      await this.bookingNotifications.notifyMatchingProgress({
        booking: bookingWithRelations,
        payload: {
          ...statusStage,
          contextKey: matchingContextKey,
          actorId,
        },
      });
    }

    if (actorId) {
      await this.bookingNotifications.notifyMatchingProgress({
        booking: bookingWithRelations,
        payload: {
          stage: 'assignment',
          status: normalizedProviderIds.length > 0 ? 'completed' : 'pending',
          count: normalizedProviderIds.length,
          providerIds: normalizedProviderIds,
          mode: normalizedMode,
          actorId,
          contextKey: matchingContextKey,
        },
      });

      await this.emitMatchingProgress(actorId, {
        stage: 'booking',
        status: 'completed',
        bookingId: booking.id,
        contextKey: matchingContextKey,
      });
    }

    if (isShortNotice) {
      await this.handleShortNoticeWorkflow({
        booking: bookingWithRelations,
        criteria: matchingCriteria,
        actorId,
        contextKey: matchingContextKey,
      });
    }

    if (normalizedProviderIds.length > 0) {
      await this.bookingNotifications.notifyParticipants({
        booking: bookingWithRelations,
        type: NotificationType.BOOKING_ASSIGNMENT,
        payload: {
          event: 'provider_assigned',
          providerIds: normalizedProviderIds,
          ...(actorId ? { actorId } : {}),
        },
        includeClient: false,
        providerTargets: normalizedProviderIds,
      });
    }

    if (attachmentInput.length > 0 && actorId) {
      await this.bookingNotifications.notifyParticipants({
        booking: bookingWithRelations,
        type: NotificationType.BOOKING_STATUS,
        payload: {
          event: 'attachment_uploaded',
          count: attachmentInput.length,
          actorId,
        },
      });
    }

    const domainBooking = BookingMapper.toDomain(bookingWithRelations);
    if (paymentSecrets) {
      return {
        ...domainBooking,
        ...paymentSecrets,
      };
    }

    return domainBooking;
  }

  async update(id: string, payload: UpdateBookingDto, user: User): Promise<BookingRequest> {
    const attachmentInput = this.buildAttachmentInput(payload.attachments ?? [], user.id);
    let statusChangedTo: BookingStatus | undefined;
    let newlyAssignedProviders: string[] = [];
    let assignmentsMutated = false;

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({
        where: { id },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
        },
      });

      if (!existing) {
        throw new NotFoundException('BOOKING_NOT_FOUND');
      }

      await this.assertBookingAccess(user, existing, { allowProvider: false });

      const nextStartAtIso = payload.startAt ?? existing.startAt.toISOString();
      const nextEndAtIso = payload.endAt ?? existing.endAt.toISOString();
      const chronologyError = this.validateChronology(nextStartAtIso, nextEndAtIso);
      if (chronologyError) {
        throw new BadRequestException(chronologyError);
      }

      const nextEcoPreference =
        payload.ecoPreference ?? BookingMapper.toDomainEcoPreference(existing.ecoPreference);
      const nextSurfaces = payload.surfacesSquareMeters ?? existing.surfacesSquareMeters;
      const pricing =
        payload.surfacesSquareMeters || payload.ecoPreference
          ? await this.calculatePricing({
              surfacesSquareMeters: nextSurfaces,
              ecoPreference: nextEcoPreference,
              clientId: existing.clientId,
            })
          : null;

      const matchingCriteria = this.buildMatchingCriteria({
        service: payload.service ?? BookingMapper.toDomainService(existing.service),
        ecoPreference: nextEcoPreference,
        startAt: nextStartAtIso,
        endAt: nextEndAtIso,
        city: payload.address?.city ?? existing.addressCity,
        excludeBookingId: existing.id,
        clientId: existing.clientId,
        priceCeilingCents: pricing?.subtotalCents ?? existing.pricingSubtotalCents,
        requiredProviders: payload.requiredProviders ?? existing.requiredProviders ?? 1,
      });

      const elevated = this.isElevated(user);
      const actorId = user.id;

      const sanitizedProviderIds = elevated ? payload.providerIds : undefined;
      const sanitizedStatus = elevated ? payload.status : undefined;
      const sanitizedCompanyId = elevated ? payload.companyId : undefined;
      const sanitizedOpsNotes = elevated ? payload.opsNotes : undefined;
      const sanitizedReminderAt = elevated ? payload.reminderAt : undefined;
      const sanitizedReminderNotes = elevated ? payload.reminderNotes : undefined;

      if (sanitizedProviderIds) {
        await this.matching.ensureProvidersEligible(sanitizedProviderIds, matchingCriteria);
      }

      const currentProviders = existing.assignments.map((assignment) => assignment.providerId);
      const providerTargets = sanitizedProviderIds;
      const removedProviders = providerTargets
        ? currentProviders.filter((providerId) => !providerTargets.includes(providerId))
        : [];
      const addedProviders = providerTargets
        ? providerTargets.filter((providerId) => !currentProviders.includes(providerId))
        : [];

      const auditEntries: Array<{
        actor: { connect: { id: string } };
        action: string;
        metadata?: Prisma.InputJsonValue;
      }> = [];

      const statusChanged =
        sanitizedStatus && BookingMapper.toPrismaStatus(sanitizedStatus) !== existing.status;

      if (statusChanged) {
        statusChangedTo = sanitizedStatus;
        auditEntries.push({
          actor: { connect: { id: actorId } },
          action: 'status_changed',
          metadata: {
            from: BookingMapper.toDomainStatus(existing.status),
            to: sanitizedStatus,
          } as Prisma.JsonObject,
        });
      }

      removedProviders.forEach((providerId) => {
        auditEntries.push({
          actor: { connect: { id: actorId } },
          action: 'provider_removed',
          metadata: { providerId } as Prisma.JsonObject,
        });
      });

      addedProviders.forEach((providerId) => {
        auditEntries.push({
          actor: { connect: { id: actorId } },
          action: 'provider_assigned',
          metadata: { providerId } as Prisma.JsonObject,
        });
      });

      if (attachmentInput.length > 0) {
        auditEntries.push({
          actor: { connect: { id: actorId } },
          action: 'attachment_uploaded',
          metadata: { count: attachmentInput.length } as Prisma.JsonObject,
        });
      }

      await tx.booking.update({
        where: { id },
        data: {
          company:
            sanitizedCompanyId !== undefined
              ? sanitizedCompanyId
                ? { connect: { id: sanitizedCompanyId } }
                : { disconnect: true }
              : undefined,
          service: payload.service,
          surfacesSquareMeters: payload.surfacesSquareMeters,
          startAt: payload.startAt ? new Date(payload.startAt) : undefined,
          endAt: payload.endAt ? new Date(payload.endAt) : undefined,
          frequency: payload.frequency ? BookingMapper.toPrismaFrequency(payload.frequency) : undefined,
          mode: payload.mode ? BookingMapper.toPrismaMode(payload.mode) : undefined,
          ecoPreference: payload.ecoPreference ? BookingMapper.toPrismaEcoPreference(payload.ecoPreference) : undefined,
          addressStreetLine1: payload.address?.streetLine1,
          addressStreetLine2: payload.address?.streetLine2,
          addressPostalCode: payload.address?.postalCode,
          addressCity: payload.address?.city,
          addressCountryCode: payload.address?.countryCode,
          addressAccessNotes: payload.address?.accessNotes,
          status: sanitizedStatus ? BookingMapper.toPrismaStatus(sanitizedStatus) : undefined,
          pricingSubtotalCents: pricing ? pricing.subtotalCents : undefined,
          pricingEcoCents: pricing ? pricing.ecoSurchargeCents : undefined,
          pricingLoyaltyCents: pricing ? pricing.loyaltyCreditsCents : undefined,
          pricingExtrasCents: pricing ? pricing.extrasCents : undefined,
          pricingTaxCents: pricing ? pricing.taxCents : undefined,
          pricingCurrency: pricing ? pricing.currency : undefined,
          pricingTotalCents: pricing ? pricing.totalCents : undefined,
          notes: payload.notes,
          opsNotes: sanitizedOpsNotes,
          reminderAt:
            sanitizedReminderAt !== undefined
              ? sanitizedReminderAt
                ? new Date(sanitizedReminderAt)
                : null
              : undefined,
          reminderNotes:
            sanitizedReminderNotes !== undefined ? sanitizedReminderNotes ?? null : undefined,
          attachments: attachmentInput.length
            ? {
                create: attachmentInput,
              }
            : undefined,
          auditLog: auditEntries.length
            ? {
                create: auditEntries,
              }
            : undefined,
        },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
        },
      });

      if (providerTargets !== undefined) {
        assignmentsMutated = true;
        if (providerTargets.length === 0) {
          await tx.bookingAssignment.deleteMany({
            where: { bookingId: id },
          });
        } else {
          await tx.bookingAssignment.deleteMany({
            where: {
              bookingId: id,
              providerId: { notIn: providerTargets },
            },
          });
        }

        if (addedProviders.length > 0) {
          await tx.bookingAssignment.createMany({
            data: addedProviders.map((providerId) => ({
              bookingId: id,
              providerId,
            })),
          });
        }
      }

      newlyAssignedProviders = addedProviders;

      return tx.booking.findUnique({
        where: { id },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
        },
      });
    });

    if (!updated) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    const bookingWithRelations = updated as BookingWithRelations;

    if (statusChangedTo) {
      await this.bookingNotifications.notifyParticipants({
        booking: bookingWithRelations,
        type:
          statusChangedTo === 'cancelled' ? NotificationType.BOOKING_CANCELLATION : NotificationType.BOOKING_STATUS,
        payload: {
          event: statusChangedTo === 'cancelled' ? 'admin_cancelled' : 'status_changed',
          status: statusChangedTo,
          actorId: user.id,
        },
      });

      const updatedStage = this.resolveMatchingStageFromStatus(statusChangedTo);
      if (updatedStage) {
        await this.bookingNotifications.notifyMatchingProgress({
          booking: bookingWithRelations,
          payload: {
            ...updatedStage,
            actorId: user.id,
          },
        });
      }
    }

    if (attachmentInput.length > 0) {
      await this.bookingNotifications.notifyParticipants({
        booking: bookingWithRelations,
        type: NotificationType.BOOKING_STATUS,
        payload: {
          event: 'attachment_uploaded',
          count: attachmentInput.length,
          actorId: user.id,
        },
      });
    }

    if (newlyAssignedProviders.length > 0) {
      await this.bookingNotifications.notifyParticipants({
        booking: bookingWithRelations,
        type: NotificationType.BOOKING_ASSIGNMENT,
        payload: {
          event: 'provider_assigned',
          providerIds: newlyAssignedProviders,
          actorId: user.id,
        },
        includeClient: false,
        providerTargets: newlyAssignedProviders,
      });
    }

    if (assignmentsMutated) {
      await this.bookingNotifications.notifyMatchingProgress({
        booking: bookingWithRelations,
        payload: {
          stage: 'assignment',
          status: bookingWithRelations.assignments.length > 0 ? 'completed' : 'pending',
          count: bookingWithRelations.assignments.length,
          providerIds: bookingWithRelations.assignments.map((assignment) => assignment.providerId),
          actorId: user.id,
        },
      });
    }

    return BookingMapper.toDomain(bookingWithRelations);
  }

  async cancel(
    id: string,
    user: User,
    payload?: CancelBookingDto,
    options: { allowProvider?: boolean } = {}
  ): Promise<BookingRequest> {
    const existing = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    await this.assertBookingAccess(user, existing, { allowProvider: options.allowProvider ?? false });

    if (!(await this.canCancelBooking(user, existing, options.allowProvider ?? false))) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    if (BookingMapper.toDomainStatus(existing.status) === 'cancelled') {
      return BookingMapper.toDomain(existing);
    }

    const reason =
      payload?.reason ??
      (this.isElevated(user)
        ? 'admin_cancelled'
        : this.isCompany(user)
        ? 'company_cancelled'
        : 'client_cancelled');

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingMapper.toPrismaStatus('cancelled'),
        auditLog: {
          create: {
            actor: { connect: { id: user.id } },
            action: 'status_changed',
            metadata: {
              from: BookingMapper.toDomainStatus(existing.status),
              to: 'cancelled',
              reason,
            },
          },
        },
      },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    const bookingWithRelations = updated as BookingWithRelations;

    await this.bookingNotifications.notifyParticipants({
      booking: bookingWithRelations,
      type: NotificationType.BOOKING_CANCELLATION,
      payload: {
        event: this.isProvider(user) ? 'provider_cancelled' : 'cancelled',
        reason,
        actorId: user.id,
      },
    });

    return BookingMapper.toDomain(bookingWithRelations);
  }

  async assignFallbackTeam(id: string, user: User): Promise<BookingRequest> {
    if (!this.isElevated(user)) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    if (!booking.fallbackTeamCandidateId || !booking.fallbackTeamCandidate) {
      throw new BadRequestException('FALLBACK_TEAM_NOT_AVAILABLE');
    }

    const candidateMembers = booking.fallbackTeamCandidate.members
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const requiredProviders = booking.requiredProviders ?? 1;
    const providerIds = candidateMembers.slice(0, requiredProviders).map((member) => member.providerId);

    if (!providerIds.length) {
      throw new BadRequestException('FALLBACK_TEAM_EMPTY');
    }

    const updated = (await this.prisma.$transaction(async (tx) => {
      await tx.bookingAssignment.deleteMany({ where: { bookingId: booking.id } });
      await tx.bookingAssignment.createMany({
        data: providerIds.map((providerId) => ({
          bookingId: booking.id,
          providerId,
          teamId: booking.fallbackTeamCandidateId,
        })),
      });

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: PrismaBookingStatus.PENDING_CLIENT,
          assignedTeamId: booking.fallbackTeamCandidateId,
          matchingRetryCount: 0,
          fallbackRequestedAt: null,
          fallbackEscalatedAt: null,
          fallbackTeamCandidateId: null,
          auditLog: {
            create: {
              actor: { connect: { id: user.id } },
              action: 'fallback_assigned',
              metadata: {
                teamId: booking.fallbackTeamCandidateId,
                providerIds,
              },
            },
          },
        },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
        },
      });
    })) as BookingWithRelations;

    const contextKey = this.buildMatchingContextKey({
      service: BookingMapper.toDomainService(booking.service),
      city: booking.addressCity,
      postalCode: booking.addressPostalCode,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      ecoPreference: BookingMapper.toDomainEcoPreference(booking.ecoPreference),
    });

    await this.bookingNotifications.notifyParticipants({
      booking: updated,
      type: NotificationType.BOOKING_ASSIGNMENT,
      payload: {
        event: 'provider_assigned',
        providerIds,
        mode: 'fallback_team',
      },
      includeClient: false,
      providerTargets: providerIds,
    });

    await this.bookingNotifications.notifyParticipants({
      booking: updated,
      type: NotificationType.BOOKING_STATUS,
      payload: {
        event: 'status_changed',
        status: 'pending_client',
        actorId: user.id,
      },
    });

    await this.bookingNotifications.notifyMatchingProgress({
      booking: updated,
      payload: {
        stage: 'team',
        status: 'completed',
        message: 'Équipe fallback assignée par Ops.',
      },
      includeOps: true,
    });

    await this.emitMatchingProgress(updated.clientId, {
      stage: 'team',
      status: 'completed',
      bookingId: updated.id,
      contextKey,
    });

    return BookingMapper.toDomain(updated);
  }

  private async buildAccessFilter(
    user: User,
    providerProfileId: string | null
  ): Promise<Prisma.BookingWhereInput | undefined> {
    if (this.isElevated(user)) {
      return undefined;
    }

    const orConditions: Prisma.BookingWhereInput[] = [];

    if (this.isClient(user)) {
      orConditions.push({ clientId: user.id });
    }

    if (this.isCompany(user)) {
      orConditions.push({ company: { ownerId: user.id } });
      orConditions.push({ company: { members: { some: { userId: user.id } } } });
    }

    if (this.isProvider(user) && providerProfileId) {
      orConditions.push({ assignments: { some: { providerId: providerProfileId } } });
    }

    if (!orConditions.length) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    return { OR: orConditions };
  }

  private async assertBookingAccess(
    user: User,
    booking: PrismaBooking & { assignments: BookingAssignment[] },
    options: { allowProvider?: boolean } = {}
  ) {
    const allowProvider = options.allowProvider ?? true;

    if (this.isElevated(user)) {
      return;
    }

    if (booking.clientId === user.id) {
      return;
    }

    if (allowProvider && this.isProvider(user)) {
      const providerProfileId = await this.getProviderProfileId(user.id);
      if (providerProfileId && booking.assignments.some((assignment) => assignment.providerId === providerProfileId)) {
        return;
      }
    }

    if (this.isCompany(user) && booking.companyId) {
      const associated = await this.isCompanyAssociated(user.id, booking.companyId);
      if (associated) {
        return;
      }
    }

    throw new ForbiddenException('BOOKING_FORBIDDEN');
  }

  private async getProviderProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    return profile?.id ?? null;
  }

  private async isCompanyAssociated(userId: string, companyId: string | null): Promise<boolean> {
    if (!companyId) {
      return false;
    }

    const [owns, member] = await Promise.all([
      this.prisma.company.findFirst({ where: { id: companyId, ownerId: userId }, select: { id: true } }),
      this.prisma.companyMember.findFirst({ where: { companyId, userId }, select: { id: true } }),
    ]);

    return Boolean(owns || member);
  }

  private resolveClientId(requestedClientId: string | undefined, user: User): string {
    if (requestedClientId && (this.isElevated(user) || this.isCompany(user))) {
      return requestedClientId;
    }

    return user.id;
  }

  private async canCancelBooking(
    user: User,
    booking: PrismaBooking & { assignments: BookingAssignment[] },
    allowProvider: boolean
  ): Promise<boolean> {
    const providerAssigned = (booking.assignments ?? []).length > 0;

    if (this.isElevated(user)) {
      return true;
    }

    if (booking.clientId === user.id || (this.isCompany(user) && booking.companyId)) {
      return !providerAssigned;
    }

    if (allowProvider && this.isProvider(user)) {
      const providerProfileId = await this.getProviderProfileId(user.id);
      if (
        providerProfileId &&
        booking.assignments.some((assignment) => assignment.providerId === providerProfileId)
      ) {
        return true;
      }
    }

    return false;
  }

  private resolveInitialStatus(payload: { mode: BookingMode; providerIds?: string[] }): BookingStatus {
    const providers = payload.providerIds ?? [];

    if (payload.mode === 'smart_match') {
      return providers.length > 0 ? 'pending_client' : 'pending_provider';
    }

    return providers.length > 0 ? 'pending_client' : 'draft';
  }

  private calculatePricing(payload: {
    surfacesSquareMeters: number;
    ecoPreference: EcoPreference;
    clientId?: string;
  }) {
    return this.pricingEngine.calculateQuote({
      surfacesSquareMeters: payload.surfacesSquareMeters,
      ecoPreference: payload.ecoPreference,
      clientId: payload.clientId,
    });
  }

  private buildAttachmentInput(attachments: string[], userId?: string | null) {
    return attachments
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(0, 10)
      .map((value, index) => ({
        type: DocumentType.PHOTO_BEFORE,
        url: value,
        name: `booking-attachment-${Date.now()}-${index + 1}`,
        metadata: { inline: value.startsWith('data:') } as Prisma.JsonObject,
        uploadedBy: userId ? { connect: { id: userId } } : undefined,
      }));
  }

  private resolveMatchingStageFromStatus(
    status: BookingStatus
  ): { stage: string; status: string } | null {
    switch (status) {
      case 'pending_provider':
        return { stage: 'matching', status: 'in_progress' };
      case 'pending_client':
        return { stage: 'matching', status: 'awaiting_client' };
      case 'confirmed':
      case 'in_progress':
        return { stage: 'matching', status: 'locked' };
      case 'completed':
        return { stage: 'matching', status: 'completed' };
      case 'cancelled':
        return { stage: 'matching', status: 'cancelled' };
      default:
        return null;
    }
  }

  private async retrySmartMatching(booking: BookingWithRelations) {
    if (BookingMapper.toDomainMode(booking.mode) !== 'smart_match') {
      return;
    }
    if ((booking.assignments?.length ?? 0) > 0) {
      return;
    }

    const matchingCriteria = this.buildMatchingCriteria({
      service: BookingMapper.toDomainService(booking.service),
      ecoPreference: BookingMapper.toDomainEcoPreference(booking.ecoPreference),
      startAt: booking.startAt,
      endAt: booking.endAt,
      city: booking.addressCity,
      excludeBookingId: booking.id,
      clientId: booking.clientId,
      priceCeilingCents: booking.pricingSubtotalCents,
      requiredProviders: booking.requiredProviders ?? 1,
    });
    const payload = this.buildRetryPayloadFromBooking(booking);
    const plan = await this.buildAssignmentPlan(payload, matchingCriteria);
    if (!plan.providerIds.length) {
      await this.handleRetryFailure(booking);
      return;
    }

    const updated = (await this.prisma.$transaction(async (tx) => {
      await tx.bookingAssignment.deleteMany({ where: { bookingId: booking.id } });
      await tx.bookingAssignment.createMany({
        data: plan.providerIds.map((providerId) => ({
          bookingId: booking.id,
          providerId,
          teamId: plan.teamId ?? null,
        })),
      });
      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: PrismaBookingStatus.PENDING_CLIENT,
          assignedTeamId: plan.teamId ?? null,
          matchingRetryCount: 0,
          fallbackEscalatedAt: null,
          fallbackRequestedAt: null,
          fallbackTeamCandidateId: null,
        },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
        },
      });
    })) as BookingWithRelations;

    const contextKey = this.buildMatchingContextKey({
      service: BookingMapper.toDomainService(updated.service),
      city: updated.addressCity,
      postalCode: updated.addressPostalCode,
      startAt: updated.startAt.toISOString(),
      endAt: updated.endAt.toISOString(),
      ecoPreference: BookingMapper.toDomainEcoPreference(updated.ecoPreference),
    });

    await this.bookingNotifications.notifyParticipants({
      booking: updated,
      type: NotificationType.BOOKING_ASSIGNMENT,
      payload: {
        event: 'provider_assigned',
        providerIds: plan.providerIds,
      },
      includeClient: false,
      providerTargets: plan.providerIds,
    });

    await this.bookingNotifications.notifyParticipants({
      booking: updated,
      type: NotificationType.BOOKING_STATUS,
      payload: {
        event: 'status_changed',
        status: 'pending_client',
      },
    });

    await this.bookingNotifications.notifyMatchingProgress({
      booking: updated,
      payload: {
        stage: 'assignment',
        status: 'completed',
        count: plan.providerIds.length,
        providerIds: plan.providerIds,
        message: 'Réaffectation automatique effectuée.',
        contextKey,
      },
    });

    await this.emitMatchingProgress(updated.clientId, {
      stage: 'booking',
      status: 'completed',
      bookingId: updated.id,
      contextKey,
    });
  }

  private buildRetryPayloadFromBooking(booking: BookingWithRelations): CreateBookingDto {
    return {
      address: {
        streetLine1: booking.addressStreetLine1,
        streetLine2: booking.addressStreetLine2 ?? '',
        postalCode: booking.addressPostalCode,
        city: booking.addressCity,
        countryCode: booking.addressCountryCode,
        accessNotes: booking.addressAccessNotes ?? undefined,
      },
      service: BookingMapper.toDomainService(booking.service),
      surfacesSquareMeters: booking.surfacesSquareMeters,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      frequency: BookingMapper.toDomainFrequency(booking.frequency),
      mode: BookingMapper.toDomainMode(booking.mode),
      ecoPreference: BookingMapper.toDomainEcoPreference(booking.ecoPreference),
      requiredProviders: booking.requiredProviders ?? 1,
      preferredTeamId: booking.preferredTeamId ?? undefined,
      notes: booking.notes ?? undefined,
    };
  }

  private async handleRetryFailure(booking: BookingWithRelations) {
    const matchingCriteria = this.buildMatchingCriteria({
      service: BookingMapper.toDomainService(booking.service),
      ecoPreference: BookingMapper.toDomainEcoPreference(booking.ecoPreference),
      startAt: booking.startAt,
      endAt: booking.endAt,
      city: booking.addressCity,
      excludeBookingId: booking.id,
      clientId: booking.clientId,
      priceCeilingCents: booking.pricingSubtotalCents,
      requiredProviders: booking.requiredProviders ?? 1,
    });
    const fallbackTeamCandidate = await this.matching.matchTeam(
      matchingCriteria,
      booking.requiredProviders ?? 1
    );
    const requestedNow = !booking.fallbackRequestedAt;
    const candidateNow = Boolean(fallbackTeamCandidate) && !booking.fallbackTeamCandidateId;

    const updateData: Prisma.BookingUpdateInput = {
      matchingRetryCount: { increment: 1 },
    };
    if (requestedNow) {
      updateData.fallbackRequestedAt = new Date();
    }
    if (candidateNow && fallbackTeamCandidate) {
      updateData.fallbackTeamCandidate = { connect: { id: fallbackTeamCandidate.teamId } };
    }

    const counters = await this.prisma.booking.update({
      where: { id: booking.id },
      data: updateData,
      select: {
        matchingRetryCount: true,
        fallbackEscalatedAt: true,
        fallbackRequestedAt: true,
        fallbackTeamCandidateId: true,
      },
    });
    booking.matchingRetryCount = counters.matchingRetryCount;
    booking.fallbackRequestedAt =
      counters.fallbackRequestedAt ?? booking.fallbackRequestedAt ?? undefined;
    booking.fallbackTeamCandidateId =
      counters.fallbackTeamCandidateId ?? booking.fallbackTeamCandidateId ?? undefined;

    if (requestedNow) {
      await this.bookingNotifications.notifyMatchingProgress({
        booking,
        payload: {
          stage: 'team',
          status: 'pending',
          message: fallbackTeamCandidate
            ? `Escalade Ops – équipe ${fallbackTeamCandidate.teamId}`
            : 'Escalade Ops – aucun renfort disponible.',
          teamCandidateId: fallbackTeamCandidate?.teamId ?? null,
        },
        includeClient: false,
        includeOps: true,
      });
    }

    if (
      counters.matchingRetryCount >= BookingsService.MAX_MATCHING_RETRY_ATTEMPTS &&
      !counters.fallbackEscalatedAt
    ) {
      const escalated = (await this.prisma.booking.update({
        where: { id: booking.id },
        data: { fallbackEscalatedAt: new Date() },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
        },
      })) as BookingWithRelations;

      await this.bookingNotifications.notifyMatchingProgress({
        booking: escalated,
        payload: {
          stage: 'team',
          status: 'pending',
          message: 'Escalade Ops – aucun prestataire disponible.',
        },
        includeClient: false,
        includeOps: true,
      });

      await this.emitMatchingProgress(escalated.clientId, {
        stage: 'team',
        status: 'pending',
        bookingId: escalated.id,
      });
    }
  }

  private async promoteLocksForBooking(booking: BookingWithLockState) {
    if ((booking.assignments?.length ?? 0) > 0) {
      return;
    }
    const plan = this.resolveLockPromotionPlan(booking);
    if (!plan) {
      return;
    }

    const updated = (await this.prisma.$transaction(async (tx) => {
      await tx.bookingAssignment.deleteMany({ where: { bookingId: booking.id } });
      await tx.bookingAssignment.createMany({
        data: plan.providerIds.map((providerId) => ({
          bookingId: booking.id,
          providerId,
          teamId: plan.teamId ?? null,
        })),
      });

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: PrismaBookingStatus.PENDING_CLIENT,
          assignedTeamId: plan.teamId ?? null,
          matchingRetryCount: 0,
          fallbackRequestedAt: null,
          fallbackEscalatedAt: null,
          fallbackTeamCandidateId: null,
        },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
        },
      });
    })) as BookingWithRelations;

    const contextKey = this.buildMatchingContextKey({
      service: BookingMapper.toDomainService(updated.service),
      city: updated.addressCity,
      postalCode: updated.addressPostalCode,
      startAt: updated.startAt.toISOString(),
      endAt: updated.endAt.toISOString(),
      ecoPreference: BookingMapper.toDomainEcoPreference(updated.ecoPreference),
    });

    await this.bookingNotifications.notifyParticipants({
      booking: updated,
      type: NotificationType.BOOKING_ASSIGNMENT,
      payload: {
        event: 'provider_assigned',
        providerIds: plan.providerIds,
        mode: plan.teamId ? 'team_lock' : 'individual_lock',
      },
      includeClient: false,
      providerTargets: plan.providerIds,
    });

    await this.bookingNotifications.notifyParticipants({
      booking: updated,
      type: NotificationType.BOOKING_STATUS,
      payload: {
        event: 'status_changed',
        status: 'pending_client',
      },
    });

    await this.bookingNotifications.notifyMatchingProgress({
      booking: updated,
      payload: {
        stage: 'assignment',
        status: 'completed',
        providerIds: plan.providerIds,
        message: plan.teamId
          ? 'Verrouillage équipe confirmé automatiquement.'
          : 'Locks prestataires confirmés automatiquement.',
      },
      includeOps: true,
    });

    await this.emitMatchingProgress(updated.clientId, {
      stage: 'booking',
      status: 'completed',
      bookingId: updated.id,
      contextKey,
    });
  }

  private resolveLockPromotionPlan(
    booking: BookingWithLockState
  ):
    | {
        providerIds: string[];
        teamId?: string;
      }
    | null {
    const required = booking.requiredProviders ?? 1;
    if (!booking.bookingLocks.length || required <= 0) {
      return null;
    }

    const sortedTeamLocks = booking.bookingLocks
      .filter((lock) => lock.providerTeamId && (lock.lockedCount ?? 0) >= required)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const lock of sortedTeamLocks) {
      const members = lock.providerTeam?.members ?? [];
      if (!members.length) {
        continue;
      }
      const orderedMembers = members
        .slice()
        .sort((a, b) => {
          if (a.isLead !== b.isLead) {
            return a.isLead ? -1 : 1;
          }
          return a.orderIndex - b.orderIndex;
        })
        .map((member) => member.providerId)
        .filter(Boolean);
      if (orderedMembers.length >= required) {
        return {
          providerIds: orderedMembers.slice(0, required),
          teamId: lock.providerTeamId ?? undefined,
        };
      }
    }

    const providerLocks = booking.bookingLocks.filter((lock) => lock.providerId);
    if (!providerLocks.length) {
      return null;
    }
    const seen = new Set<string>();
    const providerIds: string[] = [];
    const sortedProviderLocks = providerLocks.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    for (const lock of sortedProviderLocks) {
      const providerId = lock.providerId;
      if (!providerId || seen.has(providerId)) {
        continue;
      }
      seen.add(providerId);
      providerIds.push(providerId);
      if (providerIds.length >= required) {
        return { providerIds };
      }
    }
    return null;
  }

  private async releaseLockBatch(locks: (BookingTeamLock & { teamPlanSlot?: { teamPlanId: string } | null })[]) {
    await this.prisma.$transaction(async (tx) => {
      for (const lock of locks) {
        await tx.bookingTeamLock.update({
          where: { id: lock.id },
          data: { status: BookingTeamLockStatus.RELEASED },
        });
        if (lock.teamPlanSlotId) {
          const slot = await tx.teamPlanSlot.update({
            where: { id: lock.teamPlanSlotId },
            data: { booked: { decrement: lock.lockedCount } },
            select: { teamPlanId: true },
          });
          await tx.teamPlan.update({
            where: { id: slot.teamPlanId },
            data: { capacityBooked: { decrement: lock.lockedCount } },
          });
        }
      }
    });
  }

  private isElevated(user: User) {
    return user.roles.includes('admin') || user.roles.includes('employee');
  }

  private isProvider(user: User) {
    return user.roles.includes('provider');
  }

  private isClient(user: User) {
    return user.roles.includes('client');
  }

  private isCompany(user: User) {
    return user.roles.includes('company');
  }

  private validateChronology(startAt: string, endAt: string): string | null {
    const start = Date.parse(startAt);
    const end = Date.parse(endAt);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return 'INVALID_DATE_RANGE';
    }
    if (start >= end) {
      return 'BOOKING_INVALID_TIMES';
    }
    return null;
  }

  private buildMatchingCriteria(payload: {
    service: ServiceCategory;
    ecoPreference: EcoPreference;
    startAt: string | Date;
    endAt: string | Date;
    city?: string;
    excludeBookingId?: string;
    clientId?: string;
    priceCeilingCents?: number;
    requiredProviders?: number;
  }): BookingMatchingCriteria {
    return {
      service: payload.service,
      ecoPreference: payload.ecoPreference,
      startAt: typeof payload.startAt === 'string' ? new Date(payload.startAt) : payload.startAt,
      endAt: typeof payload.endAt === 'string' ? new Date(payload.endAt) : payload.endAt,
      city: payload.city,
      excludeBookingId: payload.excludeBookingId,
      clientId: payload.clientId,
      priceCeilingCents: payload.priceCeilingCents,
      requiredProviders: payload.requiredProviders,
    };
  }

  private calculateLeadTimeDays(startAtIso: string): number {
    const start = Date.parse(startAtIso);
    if (Number.isNaN(start)) {
      return 0;
    }
    const now = Date.now();
    const diff = start - now;
    if (diff <= 0) {
      return 0;
    }
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private resolveShortNoticeDeposit(input: {
    estimated?: number;
    pricingTotalCents: number;
  }): number {
    const candidates = [
      typeof input.estimated === 'number' ? Math.max(0, Math.floor(input.estimated)) : null,
      Math.max(0, input.pricingTotalCents),
    ].filter((value): value is number => typeof value === 'number');
    return candidates.length ? candidates[0]! : 0;
  }

  private async handleShortNoticeWorkflow(params: {
    booking: BookingWithRelations;
    criteria: BookingMatchingCriteria;
    actorId?: string | null;
    contextKey: string;
  }) {
    const candidateLimit = Math.max(params.booking.requiredProviders * 6, 12);
    const providerIds = await this.matching.matchProviders(params.criteria, candidateLimit);
    if (!providerIds.length) {
      if (params.actorId) {
        await this.bookingNotifications.notifyMatchingProgress({
          booking: params.booking,
          payload: {
            stage: 'short_notice',
            status: 'no_providers',
            contextKey: params.contextKey,
            actorId: params.actorId,
          },
        });
      }
      return;
    }

    await this.prisma.bookingInvitation.createMany({
      data: providerIds.map((providerId) => ({
        bookingId: params.booking.id,
        providerId,
        status: BookingInvitationStatus.PENDING,
      })),
      skipDuplicates: true,
    });

    if (params.actorId) {
      await this.bookingNotifications.notifyMatchingProgress({
        booking: params.booking,
        payload: {
          stage: 'short_notice',
          status: 'broadcasted',
          providerIds,
          contextKey: params.contextKey,
          actorId: params.actorId,
        },
      });
    }

    await this.prisma.booking.update({
      where: { id: params.booking.id },
      data: {
        auditLog: {
          create: {
            actor: params.actorId ? { connect: { id: params.actorId } } : undefined,
            action: 'short_notice_broadcasted',
            metadata: {
              providerIds,
            },
          },
        },
      },
    });

    await this.bookingNotifications.notifyParticipants({
      booking: params.booking,
      includeClient: false,
      type: NotificationType.BOOKING_ASSIGNMENT,
      providerTargets: providerIds,
      payload: {
        event: 'short_notice_invitation',
        providerIds,
      },
    });
  }

  private async buildAssignmentPlan(
    payload: CreateBookingDto,
    criteria: BookingMatchingCriteria
  ): Promise<{ providerIds: string[]; requiredProviders: number; preferredTeamId?: string; teamId?: string }> {
    const requested = payload.providerIds?.filter((value): value is string => Boolean(value)) ?? [];
    const requiredProviders = payload.requiredProviders ?? 1;
    if (requiredProviders < 1 || requiredProviders > 20) {
      throw new BadRequestException('BOOKING_INVALID_TEAM_SIZE');
    }
    const preferredTeamId = payload.preferredTeamId?.trim() || undefined;

    if (payload.mode === 'manual') {
      if (preferredTeamId) {
        const members = await this.matching.ensureTeamEligible(preferredTeamId, criteria, requiredProviders);
        return { providerIds: members, requiredProviders, preferredTeamId, teamId: preferredTeamId };
      }
      if (!requested.length) {
        return { providerIds: [], requiredProviders };
      }
      if (requested.length < requiredProviders) {
        throw new BadRequestException('BOOKING_MANUAL_TEAM_INSUFFICIENT');
      }
      await this.matching.ensureProvidersEligible(requested, criteria);
      return { providerIds: requested.slice(0, requiredProviders), requiredProviders };
    }

    if (preferredTeamId) {
      const members = await this.matching.ensureTeamEligible(preferredTeamId, criteria, requiredProviders);
      return { providerIds: members, requiredProviders, preferredTeamId, teamId: preferredTeamId };
    }

    if (requiredProviders > 1) {
      const teamMatch = await this.matching.matchTeam(criteria, requiredProviders);
      if (teamMatch) {
        return { providerIds: teamMatch.memberIds, requiredProviders, teamId: teamMatch.teamId };
      }
    }

    if (requested.length) {
      await this.matching.ensureProvidersEligible(requested, criteria);
      if (requested.length < requiredProviders) {
        throw new BadRequestException('BOOKING_MANUAL_TEAM_INSUFFICIENT');
      }
      return { providerIds: requested.slice(0, requiredProviders), requiredProviders };
    }

    const matched = await this.matching.matchProviders(criteria, requiredProviders);
    if (matched.length < requiredProviders) {
      this.logger.warn(
        `Matching returned ${matched.length}/${requiredProviders} providers for booking request (service=${criteria.service}, city=${criteria.city})`
      );
      return { providerIds: matched, requiredProviders };
    }
    return { providerIds: matched.slice(0, requiredProviders), requiredProviders };
  }
}
