import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import {
  BookingStatus as PrismaBookingStatus,
  NotificationType,
  Document,
  DocumentReviewStatus,
  DocumentType,
  EcoPreference as PrismaEcoPreference,
  Payment,
  PaymentDistribution,
  PaymentStatus as PrismaPaymentStatus,
  Prisma,
  ProviderProfile as PrismaProviderProfile,
  ProviderServiceZone as PrismaProviderServiceZone,
  ProviderType as PrismaProviderType,
  IdentityVerificationStatus as PrismaIdentityVerificationStatus,
  User as PrismaUser,
  BookingInvitationStatus as PrismaBookingInvitationStatus,
  UserRole,
} from '@prisma/client';
import type {
  BookingRequest,
  BookingStatus,
  PaymentRecord,
  ProviderDashboardAlert,
  ProviderDashboardResponse,
  ProviderProfile as ProviderProfileModel,
  ProviderResourceItem,
  ProviderDirectoryItem,
  ProviderIdentityDocumentSummary,
  ProviderAvailabilityOverview,
  User,
  ProviderBookingInvitation,
  BookingInvitationStatus,
} from '@saubio/models';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironmentConfig } from '../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingMapper, type BookingWithRelations } from '../bookings/booking.mapper';
import { ProviderMissionFiltersDto } from './dto/provider-mission-filters.dto';
import { UpdateProviderProfileDto } from './dto/update-provider-profile.dto';
import { PROVIDER_ALLOWED_STATUSES, UpdateProviderMissionStatusDto } from './dto/update-provider-mission-status.dto';
import { ProviderDirectoryDto } from './dto/provider-directory.dto';
import { BookingNotificationsService } from '../bookings/booking-notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { CompleteIdentityDto } from './dto/complete-identity.dto';
import { CompleteAddressDto } from './dto/complete-address.dto';
import { CompletePhoneDto } from './dto/complete-phone.dto';
import { RequestPhoneVerificationDto } from './dto/request-phone-verification.dto';
import { SmsService } from './sms.service';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { SignupFeeRequestDto } from './dto/signup-fee-request.dto';
import { CompleteWelcomeSessionDto } from './dto/complete-welcome-session.dto';
import { UploadIdentityDocumentDto } from './dto/upload-identity-document.dto';
import { UpdateProviderAvailabilityDto } from './dto/update-provider-availability.dto';
import { CreateProviderTimeOffDto } from './dto/create-provider-time-off.dto';
import { EmailQueueService } from '../notifications/email-queue.service';
import { NotificationsService } from '../notifications/notifications.service';

const SHORT_NOTICE_PLATFORM_FEE_CENTS = 300;
const BOOKING_CLIENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

type PrismaPaymentWithProvider = Payment & {
  amountCents: number;
  currency?: string | null;
  externalCustomerId?: string | null;
  externalPaymentIntentId?: string | null;
  externalPaymentMethodId?: string | null;
  externalSetupIntentId?: string | null;
  authorizedAt?: Date | null;
  capturedAt?: Date | null;
  releasedAt?: Date | null;
  refundedAt?: Date | null;
  cancellationReason?: string | null;
};

type PrismaPaymentDistributionWithMeta = PaymentDistribution & {
  currency?: string | null;
  externalReference?: string | null;
  availableOn?: Date | null;
  releasedAt?: Date | null;
};

type OnboardingTaskStatus = 'pending' | 'in_progress' | 'completed';
type ProviderOnboardingTaskId =
  | 'account'
  | 'identity'
  | 'address'
  | 'phone'
  | 'profile'
  | 'pricing'
  | 'payments'
  | 'id_check'
  | 'signup_fee'
  | 'welcome_session';

type ProviderOnboardingTask = {
  id: ProviderOnboardingTaskId;
  title: string;
  description: string;
  status: OnboardingTaskStatus;
  durationMinutes?: number;
};

export type ProviderOnboardingStatusResponse = {
  progress: number;
  stepsCompleted: number;
  totalSteps: number;
  tasks: ProviderOnboardingTask[];
  allCompleted: boolean;
};

type BookingInvitationWithBooking = Prisma.BookingInvitationGetPayload<{
  include: {
    booking: {
      include: {
        assignments: true;
        auditLog: true;
        attachments: true;
        fallbackTeamCandidate: { include: { members: true } };
        client: {
          select: { id: true; firstName: true; lastName: true; email: true };
        };
      };
    };
  };
}>;

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);
  private opsRecipientCache: { ids: string[]; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingNotifications: BookingNotificationsService,
    private readonly payments: PaymentsService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService<AppEnvironmentConfig>,
    private readonly emailQueue: EmailQueueService,
    private readonly notifications: NotificationsService
  ) {}

  async listDirectoryProviders(filters: ProviderDirectoryDto): Promise<ProviderDirectoryItem[]> {
    const normalizedCity = filters.city?.trim();
    const normalizedPostalCode = filters.postalCode?.trim().toLowerCase();

    const andConditions: Prisma.ProviderProfileWhereInput[] = [{ user: { isActive: true } }];

    if (normalizedCity) {
      andConditions.push({
        OR: this.buildCityVariants(normalizedCity).map((variant) => ({
          serviceAreas: { has: variant },
        })),
      });
    }

    if (normalizedPostalCode) {
      andConditions.push({
        serviceZones: {
          some: {
            OR: [
              { postalCode: { equals: normalizedPostalCode, mode: 'insensitive' } },
              { postalCode: { startsWith: normalizedPostalCode, mode: 'insensitive' } },
            ],
          },
        },
      });
    }

    if (filters.service) {
      andConditions.push({
        serviceCategories: { has: filters.service },
      });
    }

    if (typeof filters.minRateCents === 'number' || typeof filters.maxRateCents === 'number') {
      const hourlyRate: Prisma.IntFilter = {};
      if (typeof filters.minRateCents === 'number') {
        hourlyRate.gte = Math.max(0, filters.minRateCents);
      }
      if (typeof filters.maxRateCents === 'number') {
        hourlyRate.lte = Math.max(0, filters.maxRateCents);
      }
      andConditions.push({ hourlyRateCents: hourlyRate });
    }

    if (typeof filters.minRating === 'number') {
      andConditions.push({
        ratingAverage: { gte: Math.min(Math.max(filters.minRating, 0), 5) },
      });
    }

    if (filters.acceptsAnimals !== undefined) {
      andConditions.push({
        acceptsAnimals: filters.acceptsAnimals,
      });
    }

    const take = Math.min(filters.limit ?? 24, 50);

    const providers = await this.prisma.providerProfile.findMany({
      where: { AND: andConditions },
      include: {
        user: { select: { firstName: true, lastName: true } },
        documents: {
          where: { type: DocumentType.PHOTO_BEFORE },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy:
        filters.sort === 'rate'
          ? { hourlyRateCents: 'asc' }
          : { ratingAverage: 'desc' },
      take,
    });

    if (providers.length === 0) {
      return [];
    }

    const providerIds = providers.map((provider) => provider.id);
    const completedMap = await this.resolveCompletedMissions(providerIds);
    const availabilityMap =
      filters.availableOn && filters.durationHours
        ? await this.resolveAvailabilityFlags({
            providerIds,
            startAt: new Date(filters.availableOn),
            hours: filters.durationHours,
          })
        : null;

    return providers
      .filter((provider) => {
        if (!availabilityMap) {
          return true;
        }
        return availabilityMap.get(provider.id) ?? false;
      })
      .filter((provider) => {
        if (typeof filters.minCompletedMissions === 'number') {
          return (completedMap.get(provider.id) ?? 0) >= filters.minCompletedMissions;
        }
        return true;
      })
      .map<ProviderDirectoryItem>((provider) => ({
        id: provider.id,
        displayName: `${provider.user.firstName} ${provider.user.lastName}`,
        primaryCity: provider.serviceAreas[0] ?? null,
        serviceAreas: provider.serviceAreas,
        languages: provider.languages,
        hourlyRateCents: provider.hourlyRateCents,
        ratingAverage: provider.ratingAverage ?? null,
        ratingCount: provider.ratingCount ?? 0,
        completedMissions: completedMap.get(provider.id) ?? 0,
        offersEco: provider.offersEco,
        acceptsAnimals: provider.acceptsAnimals ?? false,
        yearsExperience: provider.yearsExperience ?? undefined,
        bio: provider.bio ?? undefined,
        photoUrl: provider.documents[0]?.url,
      }));
  }

  async listServiceCities(): Promise<string[]> {
    const profiles = await this.prisma.providerProfile.findMany({
      where: { user: { isActive: true } },
      select: { serviceAreas: true },
    });

    const unique = new Set<string>();
    profiles.forEach((profile) => {
      profile.serviceAreas.forEach((area) => {
        if (!area) return;
        const trimmed = area.trim();
        if (!trimmed) return;
        const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        unique.add(normalized);
      });
    });

    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'de-DE', { sensitivity: 'base' }));
  }

  async listShortNoticeInvitations(user: User): Promise<ProviderBookingInvitation[]> {
    await this.assertOnboardingComplete(user);
    const profile = await this.requireProviderProfile(user.id);
    const invitations = await this.prisma.bookingInvitation.findMany({
      where: {
        providerId: profile.id,
        status: PrismaBookingInvitationStatus.PENDING,
      },
      include: {
        booking: {
          include: {
            assignments: true,
            auditLog: true,
            attachments: true,
            fallbackTeamCandidate: { include: { members: true } },
            client: { select: BOOKING_CLIENT_SELECT },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return invitations.map((invitation) => this.mapInvitation(invitation));
  }

  async acceptShortNoticeInvitation(user: User, invitationId: string): Promise<ProviderBookingInvitation> {
    await this.assertOnboardingComplete(user);
    const profile = await this.requireProviderProfile(user.id);
    if (!profile.payoutReady) {
      throw new ConflictException('PROVIDER_PAYOUT_REQUIRED');
    }
    const { invitation, booking, pricing } = await this.prisma.$transaction(async (tx) => {
      const invitationEntity = await tx.bookingInvitation.findUnique({
        where: { id: invitationId },
        include: {
          booking: {
            include: {
              assignments: true,
              auditLog: true,
              attachments: true,
              fallbackTeamCandidate: { include: { members: true } },
              client: { select: BOOKING_CLIENT_SELECT },
            },
          },
        },
      });
      if (!invitationEntity) {
        throw new NotFoundException('INVITATION_NOT_FOUND');
      }
      if (invitationEntity.providerId !== profile.id) {
        throw new ForbiddenException('INVITATION_FORBIDDEN');
      }
      if (invitationEntity.status !== PrismaBookingInvitationStatus.PENDING) {
        throw new BadRequestException('INVITATION_ALREADY_HANDLED');
      }
      const bookingEntity = invitationEntity.booking as BookingWithRelations;
      const requiredProviders = bookingEntity.requiredProviders ?? 1;
      const assignedCount = bookingEntity.assignments.length;
      if (assignedCount >= requiredProviders) {
        throw new ConflictException('BOOKING_ALREADY_ASSIGNED');
      }
      if (
        bookingEntity.status !== PrismaBookingStatus.PENDING_PROVIDER &&
        bookingEntity.status !== PrismaBookingStatus.PENDING_CLIENT
      ) {
        throw new ConflictException('BOOKING_NOT_AVAILABLE');
      }

      await tx.bookingAssignment.create({
        data: {
          bookingId: bookingEntity.id,
          providerId: profile.id,
        },
      });

      const remainingSlots = requiredProviders - (assignedCount + 1);
      const nextStatus =
        remainingSlots <= 0 ? PrismaBookingStatus.PENDING_CLIENT : PrismaBookingStatus.PENDING_PROVIDER;

      const durationHours = this.computeDurationHours(bookingEntity.startAt, bookingEntity.endAt);
      const laborCents = this.computeLaborCostCents({
        hourlyRateCents: profile.hourlyRateCents,
        hours: durationHours,
      });
      const platformFeeCents = SHORT_NOTICE_PLATFORM_FEE_CENTS;
      const totalCents = laborCents + platformFeeCents;

      const auditEntries: Prisma.BookingAuditCreateWithoutBookingInput[] = [
        {
          actor: { connect: { id: user.id } },
          action: 'provider_assigned',
          metadata: { providerId: profile.id },
        },
        {
          actor: { connect: { id: user.id } },
          action: 'short_notice_accepted',
          metadata: { providerId: profile.id },
        },
      ];

      const updatedBooking = await tx.booking.update({
        where: { id: bookingEntity.id },
        data: {
          status: nextStatus,
          pricingSubtotalCents: laborCents,
          pricingEcoCents: 0,
          pricingExtrasCents: platformFeeCents,
          pricingTaxCents: 0,
          pricingTotalCents: totalCents,
          auditLog: {
            create: auditEntries,
          },
        },
        include: {
          assignments: true,
          auditLog: true,
          attachments: true,
          fallbackTeamCandidate: { include: { members: true } },
          client: { select: BOOKING_CLIENT_SELECT },
        },
      });

      await tx.bookingInvitation.update({
        where: { id: invitationEntity.id },
        data: {
          status: PrismaBookingInvitationStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      if (remainingSlots <= 0) {
        await tx.bookingInvitation.updateMany({
          where: {
            bookingId: bookingEntity.id,
            status: PrismaBookingInvitationStatus.PENDING,
          },
          data: {
            status: PrismaBookingInvitationStatus.EXPIRED,
            respondedAt: new Date(),
          },
        });
      }

      const freshInvitation = await tx.bookingInvitation.findUnique({
        where: { id: invitationEntity.id },
        include: {
          booking: {
            include: {
              assignments: true,
              auditLog: true,
              attachments: true,
              fallbackTeamCandidate: { include: { members: true } },
              client: { select: BOOKING_CLIENT_SELECT },
            },
          },
        },
      });

      return {
        invitation: freshInvitation,
        booking: updatedBooking as BookingWithRelations,
        pricing: {
          totalCents,
          platformFeeCents,
        },
      };
    });

    await this.bookingNotifications.notifyParticipants({
      booking,
      type: NotificationType.BOOKING_ASSIGNMENT,
      payload: {
        event: 'provider_assigned',
        providerIds: [profile.id],
        actorId: user.id,
      },
    });

    await this.bookingNotifications.notifyMatchingProgress({
      booking,
      payload: {
        stage: 'short_notice',
        status: 'accepted',
        providerId: profile.id,
      },
    });

    if (booking.client?.email) {
      await this.emailQueue.enqueue({
        to: booking.client.email,
        template: 'booking.short_notice.accepted',
        payload: {
          clientName: booking.client.firstName ?? booking.client.lastName ?? 'Client',
          providerName: profile.user?.firstName
            ? `${profile.user.firstName} ${profile.user.lastName ?? ''}`.trim()
            : profile.id,
          bookingId: booking.id,
          startAt: booking.startAt.toISOString(),
          amountCents: pricing.totalCents,
          currency: booking.pricingCurrency ?? 'EUR',
        },
      });
    }

    await this.payments.adjustShortNoticePayment({
      bookingId: booking.id,
      amountCents: pricing.totalCents,
      platformFeeCents: pricing.platformFeeCents,
    });

    return this.mapInvitation(invitation);
  }

  async declineShortNoticeInvitation(user: User, invitationId: string): Promise<ProviderBookingInvitation> {
    await this.assertOnboardingComplete(user);
    const profile = await this.requireProviderProfile(user.id);
    const invitation = await this.prisma.bookingInvitation.update({
      where: {
        id: invitationId,
        providerId: profile.id,
      },
      data: {
        status: PrismaBookingInvitationStatus.DECLINED,
        respondedAt: new Date(),
      },
      include: {
        booking: {
          include: {
            assignments: true,
            auditLog: true,
            attachments: true,
            fallbackTeamCandidate: { include: { members: true } },
            client: { select: BOOKING_CLIENT_SELECT },
          },
        },
      },
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('INVITATION_NOT_FOUND');
      }
      throw error;
    });

    await this.bookingNotifications.notifyMatchingProgress({
      booking: invitation.booking as BookingWithRelations,
      payload: {
        stage: 'short_notice',
        status: 'declined',
        providerId: profile.id,
      },
      includeClient: false,
    });

    await this.prisma.bookingAudit.create({
      data: {
        booking: { connect: { id: invitation.booking.id } },
        actor: { connect: { id: user.id } },
        action: 'short_notice_declined',
        metadata: { providerId: profile.id },
      },
    });

    return this.mapInvitation(invitation);
  }

  private buildCityVariants(city: string): string[] {
    const lower = city.toLowerCase();
    const capitalized = lower
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return Array.from(new Set([city, lower, capitalized]));
  }

  private async resolveCompletedMissions(providerIds: string[]) {
    if (!providerIds.length) {
      return new Map<string, number>();
    }
    const completedAssignments = await this.prisma.bookingAssignment.groupBy({
      by: ['providerId'],
      where: {
        providerId: { in: providerIds },
        booking: { status: PrismaBookingStatus.COMPLETED },
      },
      _count: {
        providerId: true,
      },
    });
    return new Map<string, number>(
      completedAssignments.map((entry) => [entry.providerId, entry._count.providerId])
    );
  }

  private async resolveAvailabilityFlags(params: {
    providerIds: string[];
    startAt: Date;
    hours: number;
  }): Promise<Map<string, boolean>> {
    if (!params.providerIds.length) {
      return new Map();
    }

    const start = params.startAt;
    const end = new Date(start.getTime() + params.hours * 60 * 60 * 1000);

    const conflicts = await this.prisma.bookingAssignment.findMany({
      where: {
        providerId: { in: params.providerIds },
        booking: {
          status: { in: [PrismaBookingStatus.CONFIRMED, PrismaBookingStatus.IN_PROGRESS, PrismaBookingStatus.PENDING_PROVIDER, PrismaBookingStatus.PENDING_CLIENT] },
          OR: [
            { startAt: { lt: end }, endAt: { gt: start } },
          ],
        },
      },
      select: { providerId: true },
    });

    const conflictSet = new Set(conflicts.map((entry) => entry.providerId));
    return new Map(params.providerIds.map((id) => [id, !conflictSet.has(id)]));
  }

  private computeDurationHours(startAt: Date, endAt: Date): number {
    const diffMs = endAt.getTime() - startAt.getTime();
    if (diffMs <= 0) {
      return 1;
    }
    return Math.max(1, Number((diffMs / (1000 * 60 * 60)).toFixed(2)));
  }

  private computeLaborCostCents(input: { hourlyRateCents: number; hours: number }): number {
    const rate = Math.max(0, input.hourlyRateCents);
    return Math.max(0, Math.round(rate * input.hours));
  }

  private mapInvitation(entity: BookingInvitationWithBooking | null): ProviderBookingInvitation {
    if (!entity) {
      throw new NotFoundException('INVITATION_NOT_FOUND');
    }
    const booking = entity.booking;
    const durationMs = booking.endAt.getTime() - booking.startAt.getTime();
    const durationHours = Math.max(1, Number((durationMs / (1000 * 60 * 60)).toFixed(2)));
    return {
      id: entity.id,
      bookingId: booking.id,
      status: this.mapInvitationStatus(entity.status),
      createdAt: entity.createdAt.toISOString(),
      respondedAt: entity.respondedAt ? entity.respondedAt.toISOString() : null,
      service: BookingMapper.toDomainService(booking.service),
      city: booking.addressCity,
      postalCode: booking.addressPostalCode,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      durationHours,
      ecoPreference: BookingMapper.toDomainEcoPreference(booking.ecoPreference),
      surfacesSquareMeters: booking.surfacesSquareMeters,
      requiredProviders: booking.requiredProviders ?? 1,
      shortNoticeDepositCents: booking.shortNoticeDepositCents ?? undefined,
    };
  }

  private mapInvitationStatus(status: PrismaBookingInvitationStatus): BookingInvitationStatus {
    switch (status) {
      case PrismaBookingInvitationStatus.ACCEPTED:
        return 'accepted';
      case PrismaBookingInvitationStatus.DECLINED:
        return 'declined';
      case PrismaBookingInvitationStatus.EXPIRED:
        return 'expired';
      case PrismaBookingInvitationStatus.PENDING:
      default:
        return 'pending';
    }
  }

  private async notifyOpsShortNoticeAcceptance(params: {
    booking: BookingWithRelations;
    profile: PrismaProviderProfile & { user?: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null };
    amountCents: number;
  }) {
    const opsRecipients = await this.resolveOpsRecipients();
    if (opsRecipients.length) {
    await this.notifications.emit({
      userIds: opsRecipients,
      type: NotificationType.BOOKING_STATUS,
      payload: {
        audience: 'ops',
        event: 'short_notice_accepted',
        bookingId: params.booking.id,
        providerId: params.profile.id,
        providerName: params.profile.user
          ? `${params.profile.user.firstName ?? ''} ${params.profile.user.lastName ?? ''}`.trim()
          : params.profile.id,
        amountCents: params.amountCents,
        currency: params.booking.pricingCurrency ?? 'EUR',
        postalCode: params.booking.addressPostalCode,
        startAt: params.booking.startAt.toISOString(),
      },
    });
    }
    const opsEmail = this.configService.get('app.opsEmail' as keyof AppEnvironmentConfig);
    if (typeof opsEmail === 'string' && opsEmail.includes('@')) {
      await this.emailQueue.enqueue({
        to: opsEmail,
        template: 'ops.short_notice.accepted',
        payload: {
          bookingId: params.booking.id,
          providerName: params.profile.user
            ? `${params.profile.user.firstName ?? ''} ${params.profile.user.lastName ?? ''}`.trim()
            : params.profile.id,
          clientName: params.booking.client
            ? `${params.booking.client.firstName ?? ''} ${params.booking.client.lastName ?? ''}`.trim()
            : 'Client',
          amountCents: params.amountCents,
          currency: params.booking.pricingCurrency ?? 'EUR',
          postalCode: params.booking.addressPostalCode,
          startAt: params.booking.startAt.toISOString(),
        },
      });
    }
  }

  async completeIdentityStep(user: User, payload: CompleteIdentityDto) {
    const profile = await this.ensureProviderProfile(user.id);
    const birthDate = new Date(payload.birthDate);
    const now = new Date();

    if (!payload.acceptTerms && !profile.termsAcceptedAt) {
      throw new BadRequestException('TERMS_ACCEPTANCE_REQUIRED');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: payload.firstName.trim(),
          lastName: payload.lastName.trim(),
        },
      }),
      this.prisma.providerProfile.update({
        where: { id: profile.id },
        data: {
          gender: payload.gender,
          birthDate,
          birthCity: payload.birthCity.trim(),
          birthCountry: payload.birthCountry,
          nationality: payload.nationality,
          termsAcceptedAt: profile.termsAcceptedAt ?? now,
          identityCompletedAt: profile.identityCompletedAt ?? now,
        },
      }),
    ]);

    return this.refreshOnboardingStatus(user.id);
  }

  async completeAddressStep(user: User, payload: CompleteAddressDto) {
    const profile = await this.ensureProviderProfile(user.id);
    const now = new Date();
    await this.prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        addressStreetLine1: payload.streetLine1.trim(),
        addressStreetLine2: payload.streetLine2?.trim(),
        addressPostalCode: payload.postalCode.trim(),
        addressCity: payload.city.trim(),
        addressRegion: payload.region?.trim(),
        addressCompletedAt: profile.addressCompletedAt ?? now,
      },
    });
    return this.refreshOnboardingStatus(user.id);
  }

  async completePhoneStep(user: User, payload: CompletePhoneDto) {
    const profile = await this.ensureProviderProfile(user.id);
    const now = new Date();
    if (!payload.verificationCode) {
      throw new BadRequestException('VERIFICATION_CODE_REQUIRED');
    }

    if (
      !profile.pendingPhoneNumber ||
      !profile.phoneVerificationCode ||
      !profile.phoneVerificationExpiresAt
    ) {
      throw new BadRequestException('PHONE_VERIFICATION_NOT_REQUESTED');
    }

    if (profile.phoneVerificationExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('PHONE_VERIFICATION_EXPIRED');
    }

    const isValid = await bcrypt.compare(payload.verificationCode, profile.phoneVerificationCode);
    if (!isValid) {
      throw new BadRequestException('INVALID_VERIFICATION_CODE');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          phone: profile.pendingPhoneNumber,
        },
      }),
      this.prisma.providerProfile.update({
        where: { id: profile.id },
        data: {
          phoneVerifiedAt: profile.phoneVerifiedAt ?? now,
          pendingPhoneNumber: null,
          phoneVerificationCode: null,
          phoneVerificationExpiresAt: null,
        },
      }),
    ]);

    return this.refreshOnboardingStatus(user.id);
  }

  async getOnboardingStatus(user: User) {
    return this.refreshOnboardingStatus(user.id);
  }

  async requestPhoneVerification(user: User, payload: RequestPhoneVerificationDto) {
    const profile = await this.ensureProviderProfile(user.id);
    const normalized = this.normalizePhoneNumber(payload.phoneNumber);
    if (!normalized) {
      throw new BadRequestException('INVALID_PHONE_NUMBER');
    }

    const code = String(randomInt(100000, 999999));
    const hashed = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        pendingPhoneNumber: normalized,
        phoneVerificationCode: hashed,
        phoneVerificationExpiresAt: expiresAt,
      },
    });

    try {
      await this.smsService.sendVerificationCode(normalized, code);
    } catch (error) {
      this.logger.error('Failed to send verification code via SMS', error instanceof Error ? error.stack : undefined);
      throw new BadRequestException('SMS_DELIVERY_FAILED');
    }

    return {
      success: true,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async handleSignupFee(user: User, _payload: SignupFeeRequestDto = {} as SignupFeeRequestDto) {
    const profile = await this.ensureProviderProfile(user.id);

    if (profile.signupFeePaidAt) {
      return { checkoutUrl: null, alreadyPaid: true };
    }

    const payment = await this.payments.createProviderSignupFeePayment({
      providerId: profile.id,
      user,
    });

    return {
      checkoutUrl: payment.checkoutUrl,
    };
  }

  async uploadIdentityDocument(
    user: User,
    payload: UploadIdentityDocumentDto
  ): Promise<ProviderIdentityDocumentSummary> {
    const profile = await this.requireProviderProfile(user.id);
    const inline = payload.fileData.trim().startsWith('data:');
    const isHttp = /^https?:\/\//i.test(payload.fileData.trim());
    if (!inline && !isHttp) {
      throw new BadRequestException('IDENTITY_DOCUMENT_INVALID_SOURCE');
    }
    if (inline && payload.fileData.length > 5_000_000) {
      throw new BadRequestException('IDENTITY_DOCUMENT_TOO_LARGE');
    }

    const existingCount = await this.prisma.document.count({
      where: { providerId: profile.id, type: DocumentType.IDENTITY },
    });
    if (existingCount >= 6) {
      throw new ConflictException('IDENTITY_DOCUMENT_LIMIT_REACHED');
    }

    const document = await this.prisma.document.create({
      data: {
        type: DocumentType.IDENTITY,
        url: payload.fileData,
        name: payload.fileName?.trim() || `identity-${payload.documentType}-${Date.now()}`,
        metadata: {
          inline,
          documentType: payload.documentType,
          side: payload.side ?? null,
          uploadedVia: 'manual_upload',
        } as Prisma.JsonObject,
        reviewStatus: DocumentReviewStatus.UNDER_REVIEW,
        provider: { connect: { id: profile.id } },
        uploadedBy: { connect: { id: user.id } },
      },
    });

    if (profile.identityVerificationStatus === PrismaIdentityVerificationStatus.NOT_STARTED) {
      await this.prisma.providerProfile.update({
        where: { id: profile.id },
        data: {
          identityVerificationStatus: PrismaIdentityVerificationStatus.SUBMITTED,
          identityVerificationNotes: null,
        },
      });
    }

    void this.refreshOnboardingStatus(user.id);

    return this.mapIdentityDocument(document);
  }

  async completeWelcomeSession(
    user: User,
    payload: CompleteWelcomeSessionDto
  ): Promise<ProviderOnboardingStatusResponse> {
    const roles = user.roles ?? [];
    const hasBackofficeRole = roles.includes('admin') || roles.includes('employee');
    if (!hasBackofficeRole) {
      throw new ForbiddenException('WELCOME_SESSION_ADMIN_ONLY');
    }
    const providerId = payload.providerId?.trim();
    if (!providerId) {
      throw new BadRequestException('PROVIDER_ID_REQUIRED');
    }
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException('PROVIDER_NOT_FOUND');
    }
    const reviewer = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    await this.prisma.providerProfile.update({
      where: { id: providerId },
      data: {
        welcomeSessionCompletedAt: new Date(),
        identityVerificationReviewer: reviewer,
      },
    });
    return this.refreshOnboardingStatus(provider.userId);
  }

  async getAvailability(user: User): Promise<ProviderAvailabilityOverview> {
    const profile = await this.ensureProviderProfile(user.id);
    return this.buildAvailabilityOverview(profile.id);
  }

  async updateAvailability(
    user: User,
    payload: UpdateProviderAvailabilityDto
  ): Promise<ProviderAvailabilityOverview> {
    const profile = await this.ensureProviderProfile(user.id);
    const timezone = payload.timezone?.trim() || 'Europe/Berlin';
    const slots = payload.slots ?? [];

    const existingSlots = await this.prisma.providerAvailabilitySlot.findMany({
      where: { providerId: profile.id },
    });
    const existingById = new Map(existingSlots.map((slot) => [slot.id, slot]));

    for (const slot of slots) {
      if (slot.endMinutes <= slot.startMinutes) {
        throw new BadRequestException('AVAILABILITY_SLOT_INVALID_RANGE');
      }
      if (slot.startMinutes < 0 || slot.endMinutes > 24 * 60) {
        throw new BadRequestException('AVAILABILITY_SLOT_RANGE_OUT_OF_BOUNDS');
      }
      if (slot.id && !existingById.has(slot.id)) {
        throw new BadRequestException('AVAILABILITY_SLOT_NOT_FOUND');
      }
    }

    const incomingIds = slots.filter((slot) => slot.id).map((slot) => slot.id!) ?? [];
    const deleteIds = existingSlots
      .filter((slot) => !incomingIds.includes(slot.id))
      .map((slot) => slot.id);

    const operations: Prisma.PrismaPromise<unknown>[] = [];

    if (deleteIds.length) {
      operations.push(
        this.prisma.providerAvailabilitySlot.deleteMany({
          where: {
            id: { in: deleteIds },
            providerId: profile.id,
          },
        })
      );
    }

    for (const slot of slots) {
      const data = {
        weekday: slot.weekday,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        timezone,
        isActive: slot.isActive ?? true,
      };
      if (slot.id) {
        operations.push(
          this.prisma.providerAvailabilitySlot.update({
            where: { id: slot.id },
            data,
          })
        );
      } else {
        operations.push(
          this.prisma.providerAvailabilitySlot.create({
            data: {
              ...data,
              providerId: profile.id,
            },
          })
        );
      }
    }

    if (operations.length) {
      await this.prisma.$transaction(operations);
    }

    return this.buildAvailabilityOverview(profile.id);
  }

  async createTimeOff(
    user: User,
    payload: CreateProviderTimeOffDto
  ): Promise<ProviderAvailabilityOverview> {
    const profile = await this.ensureProviderProfile(user.id);
    const startAt = new Date(payload.startAt);
    const endAt = new Date(payload.endAt);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('TIME_OFF_INVALID_DATE');
    }
    if (endAt <= startAt) {
      throw new BadRequestException('TIME_OFF_RANGE_INVALID');
    }
    if ((endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60) > 240) {
      throw new BadRequestException('TIME_OFF_RANGE_TOO_LONG');
    }

    await this.prisma.providerTimeOff.create({
      data: {
        providerId: profile.id,
        startAt,
        endAt,
        reason: payload.reason?.trim() || null,
      },
    });

    return this.buildAvailabilityOverview(profile.id);
  }

  async deleteTimeOff(
    user: User,
    timeOffId: string
  ): Promise<ProviderAvailabilityOverview> {
    const profile = await this.ensureProviderProfile(user.id);
    const deleted = await this.prisma.providerTimeOff.deleteMany({
      where: {
        id: timeOffId,
        providerId: profile.id,
      },
    });

    if (!deleted.count) {
      throw new NotFoundException('TIME_OFF_NOT_FOUND');
    }

    return this.buildAvailabilityOverview(profile.id);
  }

  private async refreshOnboardingStatus(userId: string): Promise<ProviderOnboardingStatusResponse> {
    const [dbUser, profile] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.ensureProviderProfile(userId),
    ]);

    if (!dbUser) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const status = this.buildOnboardingStatus(profile, dbUser);
    if (profile.onboardingStatus !== this.resolveOnboardingStage(status.tasks)) {
      await this.prisma.providerProfile.update({
        where: { id: profile.id },
        data: { onboardingStatus: this.resolveOnboardingStage(status.tasks) },
      });
    }

    return status;
  }

  private async buildAvailabilityOverview(providerId: string): Promise<ProviderAvailabilityOverview> {
    const [slots, timeOff] = await Promise.all([
      this.prisma.providerAvailabilitySlot.findMany({
        where: { providerId },
        orderBy: [{ weekday: 'asc' }, { startMinutes: 'asc' }],
      }),
      this.prisma.providerTimeOff.findMany({
        where: { providerId },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    const timezone = slots[0]?.timezone ?? 'Europe/Berlin';

    const normalizedSlots = slots.map((slot) => ({
      id: slot.id,
      weekday: slot.weekday,
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      timezone: slot.timezone ?? timezone,
      isActive: slot.isActive ?? true,
    }));

    const weeklyHours = normalizedSlots
      .filter((slot) => slot.isActive)
      .reduce((sum, slot) => sum + (slot.endMinutes - slot.startMinutes) / 60, 0);

    const now = new Date();

    const timeOffEntries = timeOff.map((period) => {
      const status: 'past' | 'upcoming' | 'active' =
        period.endAt < now
          ? 'past'
          : period.startAt > now
            ? 'upcoming'
            : 'active';
      const rawDuration = (period.endAt.getTime() - period.startAt.getTime()) / (1000 * 60 * 60);
      const durationHours = Math.max(0.25, Math.round(rawDuration * 10) / 10);

      return {
        id: period.id,
        startAt: period.startAt.toISOString(),
        endAt: period.endAt.toISOString(),
        reason: period.reason ?? undefined,
        status,
        durationHours,
      };
    });

    const nextTimeOff = timeOffEntries
      .filter((entry) => entry.status !== 'past')
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0]?.startAt ?? null;

    return {
      timezone,
      weeklyHours: Math.round(weeklyHours * 10) / 10,
      slots: normalizedSlots,
      timeOff: timeOffEntries,
      nextTimeOff,
    };
  }

  private buildOnboardingStatus(
    profile: PrismaProviderProfile,
    user: PrismaUser
  ): ProviderOnboardingStatusResponse {
    const identityStarted = Boolean(
      profile.gender || profile.birthDate || profile.birthCountry || profile.nationality
    );
    const addressStarted = Boolean(profile.addressStreetLine1 || profile.addressPostalCode || profile.addressCity);
    const phoneStarted = Boolean(user.phone);
    const paymentsReady = Boolean(profile.payoutReady && profile.kycStatus === 'verified');

    const profileStarted =
      Boolean(profile.bio?.trim()) ||
      Boolean(profile.serviceAreas?.length) ||
      Boolean(profile.languages?.length);
    const pricingStarted = (profile.hourlyRateCents ?? 0) > 0;
    const pricingComplete = Boolean(profile.pricingCompletedAt || pricingStarted);

    const identityVerificationStatus =
      profile.identityVerificationStatus ?? PrismaIdentityVerificationStatus.NOT_STARTED;
    const idCheckStatus = this.resolveIdentityTaskStatus(identityVerificationStatus);
    const idCheckCompleted = idCheckStatus === 'completed';
    const signupFeePaid = Boolean(profile.signupFeePaidAt);
    const welcomeSessionDone = Boolean(profile.welcomeSessionCompletedAt);

    const tasks: ProviderOnboardingTask[] = [
      {
        id: 'account',
        title: 'Créer vos identifiants',
        description: 'Votre adresse email et votre mot de passe sont enregistrés.',
        status: 'completed',
      },
      {
        id: 'identity',
        title: 'Compléter votre identité',
        description: 'Nom, prénom, informations civiles et pays de naissance.',
        status: profile.identityCompletedAt
          ? 'completed'
          : identityStarted
            ? 'in_progress'
            : 'pending',
        durationMinutes: 5,
      },
      {
        id: 'address',
        title: 'Ajouter votre adresse allemande',
        description: 'Nous intervenons uniquement en Allemagne pour le moment.',
        status: profile.addressCompletedAt
          ? 'completed'
          : addressStarted
            ? 'in_progress'
            : 'pending',
        durationMinutes: 3,
      },
      {
        id: 'phone',
        title: 'Vérifier votre numéro de téléphone',
        description: 'Indispensable pour communiquer avec les clients.',
        status: profile.phoneVerifiedAt
          ? 'completed'
          : phoneStarted
            ? 'in_progress'
            : 'pending',
        durationMinutes: 2,
      },
      {
        id: 'profile',
        title: 'Compléter votre profil public',
        description: 'Bio, langues parlées et zones desservies.',
        status: profile.profileCompletedAt
          ? 'completed'
          : profileStarted
            ? 'in_progress'
            : 'pending',
        durationMinutes: 3,
      },
      {
        id: 'pricing',
        title: 'Définir votre tarif horaire',
        description: 'Indiquez votre tarif pour débloquer les missions.',
        status: pricingComplete ? 'completed' : pricingStarted ? 'in_progress' : 'pending',
        durationMinutes: 2,
      },
      {
        id: 'payments',
        title: 'Activer vos paiements',
        description: 'Ajoutez vos coordonnées bancaires pour recevoir vos virements.',
        status: paymentsReady ? 'completed' : profile.payoutReady ? 'in_progress' : 'pending',
        durationMinutes: 5,
      },
      {
        id: 'id_check',
        title: 'Vérifier votre pièce d’identité',
        description: 'Téléchargez un passeport ou une carte d’identité valide.',
        status: idCheckStatus,
        durationMinutes: 5,
      },
      {
        id: 'signup_fee',
        title: 'Payer les frais d’inscription',
        description: 'Participation unique de 25€ pour l’activation du compte.',
        status: signupFeePaid ? 'completed' : 'pending',
        durationMinutes: 1,
      },
      {
        id: 'welcome_session',
        title: 'Session de bienvenue',
        description: 'Planifiez un échange avec l’équipe Saubio.',
        status: welcomeSessionDone ? 'completed' : 'pending',
        durationMinutes: 10,
      },
    ];

    const completed = tasks.filter((task) => task.status === 'completed').length;
    const total = tasks.length;
    const progress = Math.round((completed / total) * 100);

    return {
      tasks,
      progress,
      stepsCompleted: completed,
      totalSteps: total,
      allCompleted: tasks.every((task) => task.status === 'completed'),
    };
  }

  private resolveOnboardingStage(tasks: ProviderOnboardingTask[]): string {
    if (tasks.every((task) => task.status === 'completed')) {
      return 'ready';
    }
    const pending = tasks.find((task) => task.status !== 'completed' && task.id !== 'account');
    if (!pending) {
      return 'ready';
    }
    switch (pending.id) {
      case 'identity':
        return 'identity_pending';
      case 'address':
        return 'address_pending';
      case 'phone':
        return 'phone_pending';
      case 'profile':
        return 'profile_pending';
      case 'pricing':
        return 'pricing_pending';
      case 'payments':
        return 'payments_pending';
      case 'id_check':
        return 'id_verification_pending';
      case 'signup_fee':
        return 'fee_pending';
      case 'welcome_session':
        return 'welcome_pending';
      default:
        return 'account_created';
    }
  }

  async getDashboard(user: User): Promise<ProviderDashboardResponse> {
    const profile = await this.requireProviderProfile(user.id);
    const providerId = profile.id;
    const now = new Date();
    const thirtyDaysAgo = this.shiftDays(now, -30);
    const previousWindowStart = this.shiftDays(thirtyDaysAgo, -30);
    const inSevenDays = this.shiftDays(now, 7);

    const [
      completedCurrent,
      completedPrevious,
      ecoAssignments,
      totalAssignments,
      revenueCurrent,
      revenuePrevious,
      ratingAggregate,
      upcomingRaw,
      scheduleRaw,
      feedbackRaw,
      pendingConfirmations,
      overdueMissions,
      disputedMissions,
      resolutionSamples,
      paymentDistributions,
      resources,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: {
          assignments: { some: { providerId } },
          status: PrismaBookingStatus.COMPLETED,
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.booking.count({
        where: {
          assignments: { some: { providerId } },
          status: PrismaBookingStatus.COMPLETED,
          updatedAt: { gte: previousWindowStart, lt: thirtyDaysAgo },
        },
      }),
      this.prisma.booking.count({
        where: {
          assignments: { some: { providerId } },
          ecoPreference: PrismaEcoPreference.BIO,
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.booking.count({
        where: { assignments: { some: { providerId } }, updatedAt: { gte: thirtyDaysAgo } },
      }),
      this.sumDistributions(providerId, { occurredAt: { gte: thirtyDaysAgo } }),
      this.sumDistributions(providerId, { occurredAt: { gte: previousWindowStart, lt: thirtyDaysAgo } }),
      this.prisma.review.aggregate({
        _avg: { score: true },
        where: { targetProviderId: providerId },
      }),
      this.prisma.booking.findMany({
        where: {
          assignments: { some: { providerId } },
          startAt: { gte: now },
        },
        orderBy: { startAt: 'asc' },
        take: 5,
        select: {
          id: true,
          client: { select: { firstName: true, lastName: true } },
          service: true,
          addressCity: true,
          startAt: true,
          endAt: true,
          status: true,
          surfacesSquareMeters: true,
          ecoPreference: true,
        },
      }),
      this.prisma.booking.findMany({
        where: {
          assignments: { some: { providerId } },
          startAt: { gte: now, lte: inSevenDays },
        },
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          service: true,
          addressCity: true,
        },
      }),
      this.prisma.review.findMany({
        where: { targetProviderId: providerId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          score: true,
          comment: true,
          author: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.booking.count({
        where: {
          assignments: { some: { providerId } },
          status: PrismaBookingStatus.PENDING_CLIENT,
        },
      }),
      this.prisma.booking.count({
        where: {
          assignments: { some: { providerId } },
          status: PrismaBookingStatus.IN_PROGRESS,
          endAt: { lt: now },
        },
      }),
      this.prisma.booking.count({
        where: {
          assignments: { some: { providerId } },
          status: PrismaBookingStatus.DISPUTED,
        },
      }),
      this.prisma.booking.findMany({
        where: {
          assignments: { some: { providerId } },
          status: { in: [PrismaBookingStatus.IN_PROGRESS, PrismaBookingStatus.COMPLETED] },
          updatedAt: { gte: thirtyDaysAgo },
        },
        select: {
          createdAt: true,
          updatedAt: true,
        },
        take: 25,
      }),
      this.prisma.paymentDistribution.findMany({
        where: {
          beneficiaryId: providerId,
          beneficiaryType: 'provider',
        },
        include: {
          payment: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.fetchResourcesForProvider(providerId),
    ]);

    const satisfaction = ratingAggregate._avg.score ? Number((ratingAggregate._avg.score ?? 0).toFixed(2)) : 0;
    const revenueCentsCurrent = revenueCurrent ?? 0;
    const revenueCentsPrevious = revenuePrevious ?? 0;
    const ecoRate = totalAssignments > 0 ? Math.round((ecoAssignments / totalAssignments) * 100) : 0;
    const responseMinutes = this.computeResponseMinutes(resolutionSamples);
    const paymentsSummary = this.buildPaymentsSummary(paymentDistributions);

    const alerts: ProviderDashboardResponse['alerts'] = this.buildAlerts({
      pendingConfirmations,
      overdueMissions,
      disputedMissions,
      upcomingWithin24h: upcomingRaw.filter((mission) => mission.startAt.getTime() - now.getTime() <= 24 * 60 * 60 * 1000).length,
    });

    const upcoming = upcomingRaw.map((mission) => ({
      id: mission.id,
      client: this.composeName(mission.client?.firstName, mission.client?.lastName),
      service: BookingMapper.toDomainService(mission.service),
      city: mission.addressCity,
      startAt: mission.startAt.toISOString(),
      endAt: mission.endAt.toISOString(),
      status: BookingMapper.toDomainStatus(mission.status),
      surfaces: mission.surfacesSquareMeters,
      ecoPreference: BookingMapper.toDomainEcoPreference(mission.ecoPreference),
    }));

    const schedule = this.buildSchedule(scheduleRaw);
    const feedback = feedbackRaw.map((item) => {
      const sentiment: ProviderDashboardResponse['feedback'][number]['sentiment'] =
        item.score >= 4 ? 'positive' : item.score <= 2 ? 'negative' : 'neutral';
      return {
        id: item.id,
        client: this.composeName(item.author?.firstName, item.author?.lastName),
        rating: item.score,
        message: item.comment ?? '',
        sentiment,
        createdAt: item.createdAt.toISOString(),
      };
    });

    return {
      metrics: {
        completed: completedCurrent,
        revenueCents: Math.round(revenueCentsCurrent),
        rating: satisfaction,
        ecoRate,
      },
      trends: {
        completed: this.computeTrend(completedCurrent, completedPrevious),
        revenue: this.computeTrend(revenueCentsCurrent, revenueCentsPrevious),
        rating: 0,
        ecoRate: 0,
      },
      upcoming,
      schedule,
      alerts,
      feedback,
      quality: {
        rating: satisfaction,
        incidents: disputedMissions,
        ecoRate,
        responseMinutes,
      },
      payments: paymentsSummary,
      resources,
    };
  }

  async listMissions(user: User, filters: ProviderMissionFiltersDto): Promise<BookingRequest[]> {
    await this.assertOnboardingComplete(user);
    const profile = await this.requireProviderProfile(user.id);
    const where: Prisma.BookingWhereInput = {
      assignments: { some: { providerId: profile.id } },
    };

    const statusFilter = filters.status ?? 'all';
    if (statusFilter !== 'all') {
      where.status = BookingMapper.toPrismaStatus(statusFilter as BookingStatus);
    }

    if (filters.city) {
      where.addressCity = { contains: filters.city, mode: 'insensitive' };
    }

    if (filters.eco && filters.eco !== 'all') {
      const ecoPreference = BookingMapper.toPrismaEcoPreference(filters.eco as 'bio' | 'standard');
      if (ecoPreference) {
        where.ecoPreference = ecoPreference;
      }
    }

    if (filters.from || filters.to) {
      where.startAt = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        if (!Number.isNaN(fromDate.getTime())) {
          where.startAt.gte = fromDate;
        }
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        if (!Number.isNaN(toDate.getTime())) {
          where.startAt.lte = toDate;
        }
      }
      if (!Object.keys(where.startAt).length) {
        delete where.startAt;
      }
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      orderBy: [
        { startAt: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 100,
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    return bookings.map((booking) => BookingMapper.toDomain(booking as BookingWithRelations));
  }

  async getMission(user: User, id: string): Promise<BookingRequest> {
    await this.assertOnboardingComplete(user);
    const profile = await this.requireProviderProfile(user.id);
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

    const assigned = booking.assignments.some((assignment) => assignment.providerId === profile.id);
    if (!assigned) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    return BookingMapper.toDomain(booking as BookingWithRelations);
  }

  async updateMission(user: User, id: string, payload: UpdateProviderMissionStatusDto): Promise<BookingRequest> {
    await this.assertOnboardingComplete(user);
    const { status, note, reminderAt, reminderNote } = payload;
    if (
      status === undefined &&
      note === undefined &&
      reminderAt === undefined &&
      reminderNote === undefined
    ) {
      throw new BadRequestException('NO_UPDATES_PROVIDED');
    }

    if (status && !PROVIDER_ALLOWED_STATUSES.includes(status)) {
      throw new BadRequestException('STATUS_NOT_ALLOWED');
    }

    const profile = await this.requireProviderProfile(user.id);
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

    const assigned = booking.assignments.some((assignment) => assignment.providerId === profile.id);
    if (!assigned) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    if (!profile.payoutReady && status && ['confirmed', 'in_progress'].includes(status)) {
      const onboarding = await this.payments.startProviderOnboardingForUser(user);
      throw new ConflictException({
        code: 'PROVIDER_PAYOUT_REQUIRED',
        message: 'Veuillez finaliser la configuration de vos paiements avant d’accepter la mission.',
        onboardingUrl: onboarding.url,
        expiresAt: onboarding.expiresAt,
      });
    }

    const currentStatus = BookingMapper.toDomainStatus(booking.status);
    const nextStatus = status ?? currentStatus;
    const auditEntries: Prisma.BookingAuditCreateWithoutBookingInput[] = [];
    const updateData: Prisma.BookingUpdateInput = {};

    let shouldCapturePayment = false;

    if (status && status !== currentStatus) {
      updateData.status = BookingMapper.toPrismaStatus(status);
      auditEntries.push({
        actor: { connect: { id: user.id } },
        action: 'status_changed',
        metadata: {
          from: currentStatus,
          to: status,
          reason: status === 'cancelled' ? 'provider_cancelled' : undefined,
        },
      });

      if (status === 'confirmed') {
        shouldCapturePayment = true;
      }
    }

    if (note !== undefined) {
      updateData.providerNotes = note || null;
      auditEntries.push({
        actor: { connect: { id: user.id } },
        action: 'note_updated',
        metadata: {
          scope: 'provider',
        },
      });
    }

    if (reminderAt !== undefined || reminderNote !== undefined) {
      updateData.reminderAt = reminderAt ? new Date(reminderAt) : null;
      if (reminderNote !== undefined) {
        updateData.reminderNotes = reminderNote || null;
      }
      auditEntries.push({
        actor: { connect: { id: user.id } },
        action: 'reminder_scheduled',
        metadata: {
          reminderAt: reminderAt ?? null,
        },
      });
    }

    if (auditEntries.length) {
      updateData.auditLog = {
        create: auditEntries,
      };
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        assignments: true,
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
      },
    });

    if (shouldCapturePayment) {
      await this.capturePaymentSafely(id);
    }

    if (status && status !== currentStatus) {
      await this.bookingNotifications.notifyParticipants({
        booking: updated as BookingWithRelations,
        type: status === 'cancelled' ? NotificationType.BOOKING_CANCELLATION : NotificationType.BOOKING_STATUS,
        payload: {
          event: status === 'cancelled' ? 'provider_cancelled' : 'status_changed',
          status: nextStatus,
          actorId: user.id,
        },
      });
    }

    if (note !== undefined || reminderAt !== undefined || reminderNote !== undefined) {
      await this.bookingNotifications.notifyParticipants({
        booking: updated as BookingWithRelations,
        type: NotificationType.BOOKING_STATUS,
        payload: {
          event: note !== undefined ? 'note_updated' : 'reminder_scheduled',
          actorId: user.id,
        },
        includeClient: true,
      });
    }

    return BookingMapper.toDomain(updated as BookingWithRelations);
  }

  async cancelMission(user: User, id: string, reason?: string): Promise<BookingRequest> {
    await this.assertOnboardingComplete(user);
    const profile = await this.requireProviderProfile(user.id);
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

    const assigned = booking.assignments.some((assignment) => assignment.providerId === profile.id);
    if (!assigned) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    if (BookingMapper.toDomainStatus(booking.status) === 'cancelled') {
      return BookingMapper.toDomain(booking as BookingWithRelations);
    }

    const cancellationReason = reason ?? 'provider_cancelled';

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: PrismaBookingStatus.CANCELLED,
        auditLog: {
          create: {
            actor: { connect: { id: user.id } },
            action: 'status_changed',
            metadata: {
              from: BookingMapper.toDomainStatus(booking.status),
              to: 'cancelled',
              reason: cancellationReason,
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

    await this.bookingNotifications.notifyParticipants({
      booking: updated as BookingWithRelations,
      type: NotificationType.BOOKING_CANCELLATION,
      payload: {
        event: 'provider_cancelled',
        reason: cancellationReason,
        actorId: user.id,
      },
    });

    return BookingMapper.toDomain(updated as BookingWithRelations);
  }

  private async capturePaymentSafely(bookingId: string) {
    try {
      await this.payments.captureBookingPayment(bookingId);
    } catch (error) {
      this.logger.error(`Failed to capture payment for booking ${bookingId}`, error instanceof Error ? error.stack : undefined);
    }
  }

  async listPayments(user: User): Promise<PaymentRecord[]> {
    const profile = await this.requireProviderProfile(user.id);
    const payments = await this.prisma.payment.findMany({
      where: {
        distributions: {
          some: {
            beneficiaryId: profile.id,
            beneficiaryType: 'provider',
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
      include: {
        distributions: true,
      },
    });

    return payments.map((payment) => this.mapPayment(payment, profile.id));
  }

  async listResources(user: User): Promise<ProviderResourceItem[]> {
    const profile = await this.requireProviderProfile(user.id);
    return this.fetchResourcesForProvider(profile.id);
  }

  async getProfile(user: User): Promise<ProviderProfileModel> {
    const profile = await this.requireProviderProfile(user.id, { includeDocuments: true });
    return this.mapProviderProfile(profile);
  }

  async updateProfile(user: User, payload: UpdateProviderProfileDto): Promise<ProviderProfileModel> {
    const profile = await this.requireProviderProfile(user.id);

    const data: Prisma.ProviderProfileUpdateInput = {};

    if (payload.bio !== undefined) {
      data.bio = payload.bio;
    }
    if (payload.languages) {
      data.languages = { set: payload.languages };
    }
    if (payload.serviceAreas) {
      data.serviceAreas = { set: payload.serviceAreas };
    }
    if (payload.serviceZones) {
      await this.prisma.providerServiceZone.deleteMany({
        where: { providerId: profile.id },
      });
      if (payload.serviceZones.length) {
        await this.prisma.providerServiceZone.createMany({
          data: payload.serviceZones.map((zone) => ({
            providerId: profile.id,
            name: zone.name,
            postalCode: zone.postalCode ?? null,
            city: zone.city ?? null,
            district: zone.district ?? null,
            countryCode: zone.countryCode ?? null,
            latitude: zone.latitude ?? null,
            longitude: zone.longitude ?? null,
            radiusKm: zone.radiusKm ?? 5,
          })),
        });
      }
    }
    if (payload.serviceCategories) {
      data.serviceCategories = { set: payload.serviceCategories };
    }
    if (payload.hourlyRateCents !== undefined) {
      data.hourlyRateCents = payload.hourlyRateCents;
      if (payload.hourlyRateCents > 0 && !profile.pricingCompletedAt) {
        data.pricingCompletedAt = new Date();
      }
    }
    if (payload.offersEco !== undefined) {
      data.offersEco = payload.offersEco;
    }
    if (payload.acceptsAnimals !== undefined) {
      data.acceptsAnimals = payload.acceptsAnimals;
    }
    if (payload.yearsExperience !== undefined) {
      data.yearsExperience = payload.yearsExperience;
    }
    if (
      !profile.profileCompletedAt &&
      (payload.bio ||
        payload.languages ||
        payload.serviceAreas ||
        payload.serviceCategories ||
        payload.hourlyRateCents !== undefined ||
        payload.yearsExperience !== undefined)
    ) {
      data.profileCompletedAt = new Date();
    }

    const updated = await this.prisma.providerProfile.update({
      where: { id: profile.id },
      data,
      include: {
        documents: true,
        serviceZones: true,
      },
    });

    return this.mapProviderProfile(updated);
  }

  private async requireProviderProfile(
    userId: string,
    options: { includeDocuments?: boolean } = {}
  ): Promise<
    PrismaProviderProfile & {
      documents: Document[];
      serviceZones: PrismaProviderServiceZone[];
      user: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
    }
  > {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        ...(options.includeDocuments ? { documents: true } : {}),
        serviceZones: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (profile) {
      return profile as PrismaProviderProfile & {
        documents: Document[];
        serviceZones: PrismaProviderServiceZone[];
        user: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
      };
    }
    const created = await this.ensureProviderProfile(userId, options);
    return created as PrismaProviderProfile & {
      documents: Document[];
      serviceZones: PrismaProviderServiceZone[];
      user: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
    };
  }

  private async assertOnboardingComplete(user: User) {
    if (user.roles.includes('admin') || user.roles.includes('employee')) {
      return;
    }
    const profile = await this.ensureProviderProfile(user.id);
    if (profile.onboardingStatus !== 'ready') {
      throw new ForbiddenException('PROVIDER_ONBOARDING_INCOMPLETE');
    }
  }

  private async ensureProviderProfile(
    userId: string,
    options: { includeDocuments?: boolean } = {}
  ): Promise<
    PrismaProviderProfile & {
      documents?: Document[];
      serviceZones: PrismaProviderServiceZone[];
      user: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
    }
  > {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        ...(options.includeDocuments ? { documents: true } : {}),
        serviceZones: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (profile) {
      return profile as PrismaProviderProfile & {
        documents?: Document[];
        serviceZones: PrismaProviderServiceZone[];
        user: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
      };
    }

    const created = await this.prisma.providerProfile.create({
      data: {
        user: { connect: { id: userId } },
        providerType: PrismaProviderType.FREELANCER,
        languages: [],
        serviceAreas: [],
        serviceCategories: [],
        hourlyRateCents: 0,
        offersEco: false,
      },
      include: {
        ...(options.includeDocuments ? { documents: true } : {}),
        serviceZones: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return created as PrismaProviderProfile & {
      documents?: Document[];
      serviceZones: PrismaProviderServiceZone[];
      user: Pick<PrismaUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
    };
  }

  private mapProviderProfile(
    entity: PrismaProviderProfile & { documents?: Document[]; serviceZones?: PrismaProviderServiceZone[] }
  ): ProviderProfileModel {
    return {
      id: entity.id,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      userId: entity.userId,
      type: entity.providerType.toLowerCase() as ProviderProfileModel['type'],
      languages: entity.languages ?? [],
      serviceAreas: entity.serviceAreas ?? [],
      serviceCategories: (entity.serviceCategories ?? []) as ProviderProfileModel['serviceCategories'],
      serviceZones: (entity.serviceZones ?? []).map((zone) => ({
        id: zone.id,
        name: zone.name,
        postalCode: zone.postalCode ?? undefined,
        city: zone.city ?? undefined,
        district: zone.district ?? undefined,
        countryCode: zone.countryCode ?? undefined,
        latitude: zone.latitude ?? undefined,
        longitude: zone.longitude ?? undefined,
        radiusKm: zone.radiusKm ?? undefined,
      })),
      hourlyRateCents: entity.hourlyRateCents,
      bio: entity.bio ?? undefined,
      yearsExperience: entity.yearsExperience ?? undefined,
      ratingAverage: entity.ratingAverage ?? undefined,
      ratingCount: entity.ratingCount ?? undefined,
      offersEco: entity.offersEco,
      acceptsAnimals: entity.acceptsAnimals ?? false,
      payoutMethod: (entity.payoutMethod as ProviderProfileModel['payoutMethod']) ?? undefined,
      payoutLast4: entity.payoutLast4 ?? undefined,
      payoutReady: entity.payoutReady ?? false,
      kycStatus: entity.kycStatus ?? undefined,
      gender: entity.gender ?? undefined,
      birthDate: entity.birthDate ? entity.birthDate.toISOString() : undefined,
      birthCity: entity.birthCity ?? undefined,
      birthCountry: entity.birthCountry ?? undefined,
      nationality: entity.nationality ?? undefined,
      termsAcceptedAt: entity.termsAcceptedAt ? entity.termsAcceptedAt.toISOString() : undefined,
      address:
        entity.addressStreetLine1 && entity.addressPostalCode && entity.addressCity
          ? {
              streetLine1: entity.addressStreetLine1,
              streetLine2: entity.addressStreetLine2 ?? undefined,
              postalCode: entity.addressPostalCode,
              city: entity.addressCity,
              region: entity.addressRegion ?? undefined,
            }
          : undefined,
      onboardingStatus: entity.onboardingStatus ?? undefined,
      identityCompletedAt: entity.identityCompletedAt ? entity.identityCompletedAt.toISOString() : undefined,
      addressCompletedAt: entity.addressCompletedAt ? entity.addressCompletedAt.toISOString() : undefined,
      profileCompletedAt: entity.profileCompletedAt ? entity.profileCompletedAt.toISOString() : undefined,
      pricingCompletedAt: entity.pricingCompletedAt ? entity.pricingCompletedAt.toISOString() : undefined,
      phoneVerifiedAt: entity.phoneVerifiedAt ? entity.phoneVerifiedAt.toISOString() : undefined,
      identityVerifiedAt: entity.identityVerifiedAt ? entity.identityVerifiedAt.toISOString() : undefined,
      identityVerificationStatus: entity.identityVerificationStatus
        ? (entity.identityVerificationStatus.toLowerCase() as ProviderProfileModel['identityVerificationStatus'])
        : undefined,
      identityVerificationReviewer: entity.identityVerificationReviewer ?? undefined,
      identityVerificationReviewedAt: entity.identityVerificationReviewedAt
        ? entity.identityVerificationReviewedAt.toISOString()
        : undefined,
      identityVerificationNotes: entity.identityVerificationNotes ?? undefined,
      onfidoApplicantId: entity.onfidoApplicantId ?? undefined,
      onfidoWorkflowRunId: entity.onfidoWorkflowRunId ?? undefined,
      onfidoCheckId: entity.onfidoCheckId ?? undefined,
      onfidoReportIds: entity.onfidoReportIds && entity.onfidoReportIds.length ? entity.onfidoReportIds : undefined,
      signupFeePaidAt: entity.signupFeePaidAt ? entity.signupFeePaidAt.toISOString() : undefined,
      welcomeSessionCompletedAt: entity.welcomeSessionCompletedAt ? entity.welcomeSessionCompletedAt.toISOString() : undefined,
      documents: (entity.documents ?? []).map((doc) => ({
        id: doc.id,
        type: doc.type.toLowerCase() as ProviderProfileModel['documents'][number]['type'],
        url: doc.url,
        uploadedAt: doc.createdAt.toISOString(),
        name: doc.name ?? undefined,
        metadata:
          typeof doc.metadata === 'object' && doc.metadata !== null ? (doc.metadata as Record<string, unknown>) : undefined,
      })),
    };
  }

  private mapIdentityDocument(document: Document & { metadata?: Prisma.JsonValue | null }): ProviderIdentityDocumentSummary {
    const metadata =
      document.metadata && typeof document.metadata === 'object'
        ? (document.metadata as Record<string, unknown>)
        : {};
    const documentType =
      (metadata['documentType'] as ProviderIdentityDocumentSummary['documentType']) ?? 'id_card';
    const status: ProviderIdentityDocumentSummary['status'] =
      document.reviewStatus === DocumentReviewStatus.APPROVED
        ? 'verified'
        : document.reviewStatus === DocumentReviewStatus.REJECTED
          ? 'rejected'
          : 'submitted';

    return {
      id: document.id,
      name: document.name ?? 'Pièce d’identité',
      url: document.url,
      uploadedAt: document.createdAt.toISOString(),
      documentType,
      status,
      reviewer: document.reviewerId ?? undefined,
      reviewedAt: document.reviewedAt ? document.reviewedAt.toISOString() : undefined,
      notes: document.reviewNotes ?? undefined,
    };
  }

  private async fetchResourcesForProvider(providerProfileId: string): Promise<ProviderResourceItem[]> {
    const documents = await this.prisma.document!.findMany({
      where: {
        OR: [{ providerId: null }, { providerId: providerProfileId }],
        type: {
          in: [
            DocumentType.CHECKLIST,
            DocumentType.CONTRACT,
            DocumentType.OTHER,
            DocumentType.INSURANCE,
            DocumentType.IDENTITY,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return documents.map((doc) => ({
      id: doc.id,
      title: doc.name ?? this.friendlyDocumentTitle(doc.type),
      description: this.extractResourceDescription(doc),
      type: this.mapResourceType(doc),
      url: doc.url,
      updatedAt: doc.updatedAt.toISOString(),
    }));
  }

  private sumDistributions(
    providerProfileId: string,
    distributionWindow: { occurredAt: { gte: Date } | { gte: Date; lt: Date } }
  ): Promise<number> {
    return this.prisma.paymentDistribution!
      .aggregate({
        _sum: { amountCents: true },
        where: {
          beneficiaryId: providerProfileId,
          beneficiaryType: 'provider',
          payment: {
            status: { in: [PrismaPaymentStatus.CAPTURED, PrismaPaymentStatus.RELEASED] },
            occurredAt: distributionWindow.occurredAt,
          },
        },
      })
      .then((result) => result._sum.amountCents ?? 0);
  }

  private buildAlerts(payload: {
    pendingConfirmations: number;
    overdueMissions: number;
    disputedMissions: number;
    upcomingWithin24h: number;
  }): ProviderDashboardAlert[] {
    const alerts: ProviderDashboardAlert[] = [];

    if (payload.pendingConfirmations > 0) {
      alerts.push({
        id: 'pending_confirmations',
        type: 'availability',
        title: 'Confirmations en attente',
        message: `${payload.pendingConfirmations} mission(s) attendent une confirmation client.`,
        severity: payload.pendingConfirmations > 2 ? 'warning' : 'info',
        createdAt: new Date().toISOString(),
      });
    }

    if (payload.overdueMissions > 0) {
      alerts.push({
        id: 'overdue_missions',
        type: 'safety',
        title: 'Missions en retard',
        message: `${payload.overdueMissions} mission(s) dépassent le créneau prévu.`,
        severity: 'critical',
        createdAt: new Date().toISOString(),
      });
    }

    if (payload.disputedMissions > 0) {
      alerts.push({
        id: 'disputed',
        type: 'quality',
        title: 'Incidents ouverts',
        message: `${payload.disputedMissions} incident(s) qualité à résoudre.`,
        severity: 'warning',
        createdAt: new Date().toISOString(),
      });
    }

    if (!alerts.length) {
      alerts.push({
        id: 'all_good',
        type: 'quality',
        title: 'Agenda à jour',
        message: 'Toutes les missions planifiées sont confirmées.',
        severity: 'info',
        createdAt: new Date().toISOString(),
      });
    }

    if (payload.upcomingWithin24h > 0) {
      alerts.push({
        id: 'next_day',
        type: 'availability',
        title: 'Missions dans les 24h',
        message: `${payload.upcomingWithin24h} mission(s) démarrent d’ici demain.`,
        severity: 'info',
        createdAt: new Date().toISOString(),
      });
    }

    return alerts;
  }

  private buildSchedule(
    bookings: Array<{ id: string; startAt: Date; endAt: Date; status: PrismaBookingStatus; service: string; addressCity: string }>
  ): ProviderDashboardResponse['schedule'] {
    const grouped = new Map<string, ProviderDashboardResponse['schedule'][number]['missions']>();

    bookings.forEach((booking) => {
      const dateKey = booking.startAt.toISOString().split('T')[0]!;
      const missions = grouped.get(dateKey) ?? [];
      missions.push({
        id: booking.id,
        client: booking.addressCity,
        city: booking.addressCity,
        service: BookingMapper.toDomainService(booking.service),
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        status: BookingMapper.toDomainStatus(booking.status),
        durationMinutes: Math.max(30, Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / (1000 * 60))),
      });
      grouped.set(dateKey, missions);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([date, missions]) => ({
        date,
        missions,
      }));
  }

  private buildPaymentsSummary(
    distributions: Array<PrismaPaymentDistributionWithMeta & { payment: PrismaPaymentWithProvider | null }>
  ) {
    const totalCents = distributions
      .filter((distribution) => {
        if (!distribution.payment?.status) {
          return false;
        }
        return (
          distribution.payment.status === PrismaPaymentStatus.CAPTURED ||
          distribution.payment.status === PrismaPaymentStatus.RELEASED
        );
      })
      .reduce((sum, distribution) => sum + distribution.amountCents, 0);
    const pendingCents = distributions
      .filter((distribution) => (distribution.payoutStatus ?? 'pending') !== 'paid')
      .reduce((sum, distribution) => sum + distribution.amountCents, 0);
    const lastPayout = distributions.find((distribution) => distribution.payoutStatus === 'paid');

    return {
      totalCents,
      pendingCents,
      lastPayoutAt: lastPayout ? lastPayout.updatedAt.toISOString() : null,
    };
  }

  private mapPayment(
    payment: PrismaPaymentWithProvider & { distributions: PrismaPaymentDistributionWithMeta[] },
    providerId: string
  ): PaymentRecord {
    return {
      id: payment.id,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      bookingId: payment.bookingId,
      clientId: payment.clientId,
      amountCents: payment.amountCents,
      currency: (payment.currency ?? 'EUR') as PaymentRecord['currency'],
      providerDistributions: payment.distributions
        .filter((distribution) => distribution.beneficiaryId === providerId)
        .map((distribution) => ({
          beneficiaryId: distribution.beneficiaryId,
          beneficiaryType: distribution.beneficiaryType === 'provider' ? 'provider' : 'company',
          amountCents: distribution.amountCents,
          currency: (distribution.currency ?? payment.currency ?? 'EUR') as PaymentRecord['currency'],
          payoutStatus: this.mapPayoutStatus(distribution.payoutStatus),
          externalReference: distribution.externalReference ?? undefined,
          availableOn: distribution.availableOn ? distribution.availableOn.toISOString() : undefined,
          releasedAt: distribution.releasedAt ? distribution.releasedAt.toISOString() : undefined,
        })),
      platformFeeCents: payment.platformFeeCents,
      status: payment.status.toLowerCase() as PaymentRecord['status'],
      method: payment.method.toLowerCase() as PaymentRecord['method'],
      externalReference: payment.externalReference ?? undefined,
      externalCustomerId: payment.externalCustomerId ?? undefined,
      externalPaymentIntentId: payment.externalPaymentIntentId ?? undefined,
      externalPaymentMethodId: payment.externalPaymentMethodId ?? undefined,
      externalSetupIntentId: payment.externalSetupIntentId ?? undefined,
      authorizedAt: payment.authorizedAt ? payment.authorizedAt.toISOString() : undefined,
      capturedAt: payment.capturedAt ? payment.capturedAt.toISOString() : undefined,
      releasedAt: payment.releasedAt ? payment.releasedAt.toISOString() : undefined,
      refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : undefined,
      cancellationReason: payment.cancellationReason ?? undefined,
      occurredAt: payment.occurredAt.toISOString(),
    };
  }

  private mapResourceType(document: Document): ProviderResourceItem['type'] {
    if (document.type === DocumentType.CHECKLIST) {
      return 'checklist';
    }
    if (document.type === DocumentType.OTHER && typeof document.metadata === 'object' && document.metadata !== null) {
      const metadata = document.metadata as Record<string, unknown>;
      const resourceType = metadata['resourceType'];
      if (resourceType === 'training') {
        return 'training';
      }
    }
    return 'document';
  }

  private extractResourceDescription(document: Document): string {
    if (typeof document.metadata === 'object' && document.metadata !== null && 'description' in document.metadata) {
      const description = (document.metadata as Record<string, unknown>).description;
      if (typeof description === 'string') {
        return description;
      }
    }
    return 'Consultez cette ressource pour préparer vos missions.';
  }

  private mapPayoutStatus(status?: string | null): 'pending' | 'processing' | 'paid' | 'failed' {
    const normalized = (status ?? 'pending').toLowerCase();
    if (normalized === 'processing' || normalized === 'paid' || normalized === 'failed') {
      return normalized;
    }
    return 'pending';
  }

  private friendlyDocumentTitle(type: DocumentType): string {
    switch (type) {
      case DocumentType.CHECKLIST:
        return 'Checklist';
      case DocumentType.INSURANCE:
        return 'Assurance';
      case DocumentType.CONTRACT:
        return 'Contrat';
      case DocumentType.IDENTITY:
        return 'Identité';
      default:
        return 'Ressource';
    }
  }

  private computeResponseMinutes(samples: Array<{ createdAt: Date; updatedAt: Date }>): number {
    if (!samples.length) {
      return 0;
    }

    const total = samples.reduce((acc, sample) => acc + (sample.updatedAt.getTime() - sample.createdAt.getTime()), 0);
    return Math.max(5, Math.round(total / samples.length / (1000 * 60)));
  }

  private composeName(firstName?: string | null, lastName?: string | null) {
    const parts = [firstName, lastName].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Client';
  }

  private computeTrend(current: number, previous: number) {
    if (!previous) {
      return current > 0 ? 100 : 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  private shiftDays(date: Date, delta: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    return next;
  }

  private resolveIdentityTaskStatus(
    status: PrismaIdentityVerificationStatus
  ): OnboardingTaskStatus {
    if (status === PrismaIdentityVerificationStatus.VERIFIED) {
      return 'completed';
    }
    if (status === PrismaIdentityVerificationStatus.SUBMITTED) {
      return 'in_progress';
    }
    return 'pending';
  }

  private normalizePhoneNumber(raw: string): string | null {
    if (!raw) {
      return null;
    }
    const trimmed = raw.replace(/\s+/g, '');
    if (trimmed.startsWith('+') && /^\+\d+$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d+$/.test(trimmed)) {
      return `+${trimmed}`;
    }
    return null;
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
