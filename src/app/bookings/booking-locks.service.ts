import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingTeamLock, BookingTeamLockStatus, ProviderTeam } from '@prisma/client';
import type { User } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ConfirmBookingLocksDto,
  CreateBookingLockDto,
  ReleaseBookingLocksDto,
} from './dto/create-lock.dto';
import { TeamPlanningService } from './team-planning.service';

const DEFAULT_LOCK_DURATION_MINUTES = 15;
const ACTIVE_LOCK_STATUSES: BookingTeamLockStatus[] = [
  BookingTeamLockStatus.HELD,
  BookingTeamLockStatus.CONFIRMED,
];

export interface BookingLockResponse {
  id: string;
  bookingId: string;
  providerTeamId?: string | null;
  providerId?: string | null;
  lockedCount: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface BookingLockDetail extends BookingLockResponse {
  providerDisplayName?: string;
  providerTeamName?: string;
  slotStartAt?: string | null;
  slotEndAt?: string | null;
}

type BookingLockContext = Pick<
  Booking,
  'id' | 'startAt' | 'endAt' | 'requiredProviders' | 'status' | 'assignedTeamId'
>;

@Injectable()
export class BookingLocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamPlanning: TeamPlanningService
  ) {}

  async createLocks(
    bookingId: string,
    payload: CreateBookingLockDto,
    user: User
  ): Promise<BookingLockResponse[]> {
    this.assertOpsUser(user);
    const booking = await this.loadBooking(bookingId);
    if (payload.providerTeamId) {
      const lock = await this.lockTeam(booking, payload);
      return [this.toResponse(lock)];
    }
    if (payload.providerIds?.length) {
      const locks = await this.lockProviders(booking, payload);
      return locks.map((lock) => this.toResponse(lock));
    }
    throw new BadRequestException('LOCK_TARGET_REQUIRED');
  }

  async confirmLocks(
    bookingId: string,
    payload: ConfirmBookingLocksDto,
    user: User
  ): Promise<BookingLockResponse[]> {
    this.assertOpsUser(user);
    await this.loadBooking(bookingId);
    const where = {
      bookingId,
      status: BookingTeamLockStatus.HELD,
      ...(payload.lockIds?.length ? { id: { in: payload.lockIds } } : {}),
    };
    const locks = await this.prisma.bookingTeamLock.findMany({ where });
    if (!locks.length) {
      return [];
    }
    const confirmed = await this.prisma.$transaction(async (tx) => {
      return Promise.all(
        locks.map((lock) =>
          tx.bookingTeamLock.update({
            where: { id: lock.id },
            data: {
              status: BookingTeamLockStatus.CONFIRMED,
              expiresAt: lock.expiresAt < new Date() ? new Date() : lock.expiresAt,
            },
          })
        )
      );
    });
    return confirmed.map((lock) => this.toResponse(lock));
  }

  async releaseLocks(
    bookingId: string,
    payload: ReleaseBookingLocksDto,
    user: User
  ): Promise<BookingLockResponse[]> {
    this.assertOpsUser(user);
    await this.loadBooking(bookingId);
    const where = {
      bookingId,
      status: { in: ACTIVE_LOCK_STATUSES },
      ...(payload.lockIds?.length ? { id: { in: payload.lockIds } } : {}),
    };
    const locks = await this.prisma.bookingTeamLock.findMany({
      where,
    });
    if (!locks.length) {
      return [];
    }

    const released = await this.prisma.$transaction(async (tx) => {
      const updatedLocks: BookingTeamLock[] = [];
      for (const lock of locks) {
        await tx.bookingTeamLock.update({
          where: { id: lock.id },
          data: {
            status: BookingTeamLockStatus.RELEASED,
          },
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
        updatedLocks.push({ ...lock, status: BookingTeamLockStatus.RELEASED });
      }
      return updatedLocks;
    });

    return released.map((lock) => this.toResponse(lock));
  }

  async listLocks(bookingId: string, user: User): Promise<BookingLockDetail[]> {
    this.assertOpsUser(user);
    await this.loadBooking(bookingId);
    const locks = await this.prisma.bookingTeamLock.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      include: {
        providerTeam: { select: { id: true, name: true } },
        provider: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        teamPlanSlot: { select: { startAt: true, endAt: true } },
      },
    });
    return locks.map((lock) => ({
      ...this.toResponse(lock),
      providerDisplayName:
        lock.provider?.user && (lock.provider.user.firstName || lock.provider.user.lastName)
          ? `${lock.provider.user.firstName ?? ''} ${lock.provider.user.lastName ?? ''}`.trim()
          : undefined,
      providerTeamName: lock.providerTeam?.name ?? undefined,
      slotStartAt: lock.teamPlanSlot?.startAt?.toISOString() ?? null,
      slotEndAt: lock.teamPlanSlot?.endAt?.toISOString() ?? null,
    }));
  }

  private assertOpsUser(user: User) {
    if (!user.roles.includes('admin') && !user.roles.includes('employee')) {
      throw new ForbiddenException('BOOKING_LOCK_FORBIDDEN');
    }
  }

  private async loadBooking(bookingId: string): Promise<BookingLockContext> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        requiredProviders: true,
        status: true,
        assignedTeamId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }
    return booking;
  }

  private async lockTeam(
    booking: BookingLockContext,
    payload: CreateBookingLockDto
  ): Promise<BookingTeamLock> {
    const team = await this.prisma.providerTeam.findUnique({
      where: { id: payload.providerTeamId! },
      include: { members: true },
    });
    if (!team || !team.isActive) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }
    const requested =
      payload.lockedCount ?? booking.requiredProviders ?? team.members.length;
    const planSlot = await this.teamPlanning.ensureSlot(team.id, booking.startAt, booking.endAt);
    const headroom = planSlot.capacity - planSlot.booked;
    if (headroom <= 0) {
      throw new BadRequestException('TEAM_CAPACITY_EXCEEDED');
    }
    const lockSize = Math.min(requested, headroom);
    const expiresAt = this.computeExpiry(payload.expiresInMinutes);

    const lock = await this.prisma.$transaction(async (tx) => {
      const latestSlot = await tx.teamPlanSlot.findUnique({
        where: { id: planSlot.id },
        select: { id: true, capacity: true, booked: true, teamPlanId: true },
      });
      if (!latestSlot || latestSlot.capacity - latestSlot.booked < lockSize) {
        throw new BadRequestException('TEAM_CAPACITY_EXCEEDED');
      }
      const created = await tx.bookingTeamLock.create({
        data: {
          bookingId: booking.id,
          providerTeamId: team.id,
          lockedCount: lockSize,
          status: BookingTeamLockStatus.HELD,
          expiresAt,
          teamPlanSlotId: planSlot.id,
        },
      });
      await tx.teamPlanSlot.update({
        where: { id: planSlot.id },
        data: { booked: { increment: lockSize } },
      });
      await tx.teamPlan.update({
        where: { id: latestSlot.teamPlanId },
        data: { capacityBooked: { increment: lockSize } },
      });
      return created;
    });

    return lock;
  }

  private async lockProviders(
    booking: BookingLockContext,
    payload: CreateBookingLockDto
  ): Promise<BookingTeamLock[]> {
    const providerIds = payload.providerIds ?? [];
    const uniqueIds = Array.from(new Set(providerIds));
    if (!uniqueIds.length) {
      throw new BadRequestException('PROVIDERS_REQUIRED');
    }
    const conflicts = await this.prisma.bookingTeamLock.findMany({
      where: {
        providerId: { in: uniqueIds },
        status: { in: ACTIVE_LOCK_STATUSES },
        booking: {
          id: { not: booking.id },
          startAt: { lt: booking.endAt },
          endAt: { gt: booking.startAt },
        },
      },
    });
    if (conflicts.length) {
      throw new BadRequestException('PROVIDER_ALREADY_LOCKED');
    }
    const assignments = await this.prisma.bookingAssignment.findMany({
      where: {
        providerId: { in: uniqueIds },
        booking: {
          startAt: { lt: booking.endAt },
          endAt: { gt: booking.startAt },
          status: { in: ['PENDING_PROVIDER', 'PENDING_CLIENT', 'CONFIRMED', 'IN_PROGRESS'] },
        },
      },
    });
    if (assignments.length) {
      throw new BadRequestException('PROVIDER_ALREADY_ASSIGNED');
    }

    const expiresAt = this.computeExpiry(payload.expiresInMinutes);
    const locks = await this.prisma.$transaction(async (tx) => {
      return Promise.all(
        uniqueIds.map((providerId) =>
          tx.bookingTeamLock.create({
            data: {
              bookingId: booking.id,
              providerId,
              lockedCount: 1,
              status: BookingTeamLockStatus.HELD,
              expiresAt,
            },
          })
        )
      );
    });

    return locks;
  }

  private computeExpiry(requestedMinutes?: number): Date {
    const minutes = Math.max(requestedMinutes ?? DEFAULT_LOCK_DURATION_MINUTES, 5);
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private toResponse(lock: BookingTeamLock): BookingLockResponse {
    return {
      id: lock.id,
      bookingId: lock.bookingId,
      providerTeamId: lock.providerTeamId,
      providerId: lock.providerId,
      lockedCount: lock.lockedCount,
      status: lock.status,
      expiresAt: lock.expiresAt.toISOString(),
      createdAt: lock.createdAt.toISOString(),
    };
  }
}
