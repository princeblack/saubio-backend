import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ProviderTeam as ProviderTeamModel,
  ProviderTeamSchedule,
  ProviderTeamFallbackMission,
  ProviderTeamPlan,
  ServiceCategory,
} from '@saubio/models';
import type {
  ProviderTeam,
  ProviderTeamMember,
  Prisma,
  BookingStatus,
  ProviderProfile,
  ProviderAvailabilitySlot,
  ProviderTimeOff,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProviderTeamDto, UpdateProviderTeamDto } from '../provider/dto/create-provider-team.dto';
import { DateTime } from 'luxon';
import { TeamPlanningService } from '../bookings/team-planning.service';

const BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  'DRAFT',
  'PENDING_PROVIDER',
  'PENDING_CLIENT',
  'CONFIRMED',
  'IN_PROGRESS',
];

@Injectable()
export class AdminProviderTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamPlanning: TeamPlanningService
  ) {}

  async list(ownerId?: string): Promise<ProviderTeamModel[]> {
    const teams = await this.prisma.providerTeam.findMany({
      where: ownerId ? { ownerId } : undefined,
      include: { members: true },
      orderBy: { createdAt: 'desc' },
    });
    const fallbackMap = await this.buildFallbackQueueMap(teams.map((team) => team.id));
    return teams.map((team) => this.mapTeam(team, fallbackMap.get(team.id)));
  }

  async get(id: string): Promise<ProviderTeamModel> {
    const team = await this.prisma.providerTeam.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!team) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }
    const fallbackMap = await this.buildFallbackQueueMap([team.id]);
    return this.mapTeam(team, fallbackMap.get(team.id));
  }

  async create(payload: CreateProviderTeamDto): Promise<ProviderTeamModel> {
    const ownerId = payload.ownerId?.trim();
    if (!ownerId) {
      throw new BadRequestException('TEAM_OWNER_REQUIRED');
    }
    await this.ensureProviderExists(ownerId);
    const memberInputs = this.normalizeMembers(payload.members);

    await this.ensureMembersExist(memberInputs.map((member) => member.providerId));

    const created = await this.prisma.providerTeam.create({
      data: {
        ownerId,
        name: payload.name,
        description: payload.description?.trim() || null,
        serviceCategories: this.normalizeServiceCategories(payload.serviceCategories ?? []),
        preferredSize: payload.preferredSize ?? null,
        notes: payload.notes?.trim() || null,
        defaultDailyCapacity: payload.defaultDailyCapacity ?? null,
        timezone: payload.timezone?.trim() || 'Europe/Berlin',
        members: {
          create: memberInputs.map((member) => ({
            providerId: member.providerId,
            role: member.role ?? null,
            isLead: member.isLead ?? false,
            orderIndex: member.orderIndex ?? 0,
          })),
        },
      },
      include: { members: true },
    });

    return this.mapTeam(created, []);
  }

  async update(id: string, payload: UpdateProviderTeamDto): Promise<ProviderTeamModel> {
    const existing = await this.prisma.providerTeam.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }

    if (payload.ownerId) {
      await this.ensureProviderExists(payload.ownerId);
    }

    let memberOps: Prisma.ProviderTeamMemberUncheckedUpdateManyWithoutTeamNestedInput | undefined;
    if (payload.members) {
      const memberInputs = this.normalizeMembers(payload.members);
      await this.ensureMembersExist(memberInputs.map((member) => member.providerId));
      memberOps = {
        deleteMany: { teamId: id },
        create: memberInputs.map((member) => ({
          providerId: member.providerId,
          role: member.role ?? null,
          isLead: member.isLead ?? false,
          orderIndex: member.orderIndex ?? 0,
        })),
      };
    }

    const updated = await this.prisma.providerTeam.update({
      where: { id },
      data: {
        ownerId: payload.ownerId ?? undefined,
        name: payload.name,
        description: payload.description?.trim(),
        serviceCategories: payload.serviceCategories
          ? this.normalizeServiceCategories(payload.serviceCategories)
          : undefined,
        preferredSize: payload.preferredSize,
        notes: payload.notes?.trim(),
        defaultDailyCapacity: payload.defaultDailyCapacity ?? undefined,
        timezone: payload.timezone?.trim() ?? undefined,
        members: memberOps,
      },
      include: { members: true },
    });

    const fallbackMap = await this.buildFallbackQueueMap([updated.id]);
    return this.mapTeam(updated, fallbackMap.get(updated.id));
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.providerTeam.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }
    await this.prisma.$transaction([
      this.prisma.providerTeamMember.deleteMany({ where: { teamId: id } }),
      this.prisma.providerTeam.delete({ where: { id } }),
    ]);
    return { success: true };
  }

  async getPlan(
    id: string,
    range: { start?: string; end?: string } = {}
  ): Promise<ProviderTeamPlan> {
    const team = await this.prisma.providerTeam.findUnique({
      where: { id },
      select: { id: true, name: true, timezone: true },
    });
    if (!team) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }
    const timezone = team.timezone ?? 'Europe/Berlin';
    const startDate = range.start
      ? DateTime.fromISO(range.start, { zone: timezone })
      : DateTime.now().setZone(timezone);
    const endDate = range.end
      ? DateTime.fromISO(range.end, { zone: timezone })
      : startDate.plus({ days: 7 });
    const normalizedStart = startDate.isValid ? startDate : DateTime.now().setZone(timezone);
    const normalizedEnd = endDate.isValid ? endDate : normalizedStart.plus({ days: 7 });
    await this.teamPlanning.generatePlansForRange(id, normalizedStart.toJSDate(), normalizedEnd.toJSDate());

    const startUtc = normalizedStart.startOf('day').toUTC().toJSDate();
    const endUtc = normalizedEnd.endOf('day').toUTC().toJSDate();
    const plans = await this.prisma.teamPlan.findMany({
      where: {
        providerTeamId: id,
        date: { gte: startUtc, lte: endUtc },
      },
      orderBy: { date: 'asc' },
      include: {
        slots: { orderBy: { startAt: 'asc' } },
      },
    });

    return {
      teamId: id,
      teamName: team.name,
      timezone,
      days: plans.map((plan) => ({
        id: plan.id,
        date: plan.date.toISOString(),
        capacitySlots: plan.capacitySlots,
        capacityBooked: plan.capacityBooked,
        slots: plan.slots.map((slot) => ({
          id: slot.id,
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          capacity: slot.capacity,
          booked: slot.booked,
        })),
      })),
    };
  }

  async getSchedule(id: string): Promise<ProviderTeamSchedule> {
    const team = await this.prisma.providerTeam.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { orderIndex: 'asc' },
          include: {
            provider: {
              include: {
                user: { select: { firstName: true, lastName: true } },
                availabilitySlots: true,
                timeOffPeriods: true,
              },
            },
          },
        },
      },
    });
    if (!team) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }

    const providerIds = team.members.map((member) => member.providerId);
    const assignments = providerIds.length
      ? await this.prisma.bookingAssignment.groupBy({
          by: ['providerId'],
          _count: { providerId: true },
          where: {
            providerId: { in: providerIds },
            booking: {
              status: { in: BLOCKING_BOOKING_STATUSES },
              startAt: { gte: new Date() },
            },
          },
        })
      : [];
    const assignmentMap = new Map(assignments.map((entry) => [entry.providerId, entry._count.providerId]));

    const members = team.members.map((member) => this.buildMemberSchedule(member, assignmentMap));
    const weeklyCapacityHours = members.reduce((sum, member) => sum + member.weeklyHours, 0);
    const activeMembers = members.filter((member) => member.weeklyHours > 0).length;
    const timezone = this.resolveTeamTimezone(members);

    return {
      teamId: team.id,
      teamName: team.name,
      timezone,
      totalMembers: members.length,
      activeMembers,
      weeklyCapacityHours: Math.round(weeklyCapacityHours * 10) / 10,
      members,
    };
  }

  private async ensureProviderExists(providerId: string) {
    const provider = await this.prisma.providerProfile.findUnique({ where: { id: providerId } });
    if (!provider) {
      throw new NotFoundException('PROVIDER_NOT_FOUND');
    }
  }

  private async ensureMembersExist(providerIds: string[]) {
    const unique = Array.from(new Set(providerIds));
    const count = await this.prisma.providerProfile.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new NotFoundException('TEAM_MEMBER_NOT_FOUND');
    }
  }

  private normalizeMembers(members: CreateProviderTeamDto['members']) {
    const seen = new Set<string>();
    members.forEach((member) => {
      if (seen.has(member.providerId)) {
        throw new BadRequestException('TEAM_MEMBER_DUPLICATE');
      }
      seen.add(member.providerId);
    });
    return members;
  }

  private mapTeam(
    team: ProviderTeam & { members: ProviderTeamMember[] },
    fallbackQueue: ProviderTeamFallbackMission[] = []
  ): ProviderTeamModel {
    const members = team.members
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((member) => ({
        id: member.id,
        createdAt: member.createdAt.toISOString(),
        updatedAt: member.updatedAt.toISOString(),
        teamId: member.teamId,
        providerId: member.providerId,
        role: member.role ?? undefined,
        isLead: member.isLead,
        orderIndex: member.orderIndex,
      }));

    return {
      id: team.id,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
      ownerId: team.ownerId,
      name: team.name,
      description: team.description ?? undefined,
      serviceCategories: this.normalizeServiceCategories(team.serviceCategories ?? []),
      preferredSize: team.preferredSize ?? undefined,
      isActive: team.isActive,
      notes: team.notes ?? undefined,
      defaultDailyCapacity: team.defaultDailyCapacity ?? undefined,
      timezone: team.timezone ?? undefined,
      members,
      fallbackQueue,
    };
  }

  private buildMemberSchedule(
    member: ProviderTeamMember & {
      provider: ProviderProfile & {
        user: { firstName: string | null; lastName: string | null };
        availabilitySlots: ProviderAvailabilitySlot[];
        timeOffPeriods: ProviderTimeOff[];
      };
    },
    assignmentMap: Map<string, number>
  ): ProviderTeamSchedule['members'][number] {
    const slots = member.provider.availabilitySlots
      .slice()
      .sort((a, b) =>
        a.weekday === b.weekday ? a.startMinutes - b.startMinutes : a.weekday - b.weekday
      )
      .map((slot) => ({
        weekday: slot.weekday,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        isActive: slot.isActive ?? true,
      }));
    const timezone = member.provider.availabilitySlots[0]?.timezone ?? 'Europe/Berlin';
    const weeklyHours = slots
      .filter((slot) => slot.isActive)
      .reduce((sum, slot) => sum + (slot.endMinutes - slot.startMinutes) / 60, 0);

    const now = new Date();
    const timeOff = member.provider.timeOffPeriods
      .slice()
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((period) => {
        const status: 'past' | 'active' | 'upcoming' =
          period.endAt < now ? 'past' : period.startAt > now ? 'upcoming' : 'active';
        return {
          id: period.id,
          startAt: period.startAt.toISOString(),
          endAt: period.endAt.toISOString(),
          status,
          reason: period.reason ?? undefined,
        };
      });

    return {
      providerId: member.providerId,
      displayName: `${member.provider.user.firstName ?? ''} ${member.provider.user.lastName ?? ''}`.trim(),
      role: member.role ?? undefined,
      isLead: member.isLead,
      timezone,
      weeklyHours: Math.round(weeklyHours * 10) / 10,
      availability: slots,
      timeOff,
      blockingAssignments: assignmentMap.get(member.providerId) ?? 0,
    };
  }

  private resolveTeamTimezone(members: ProviderTeamSchedule['members']): string {
    if (!members.length) {
      return 'Europe/Berlin';
    }
    const tally = new Map<string, number>();
    for (const member of members) {
      tally.set(member.timezone, (tally.get(member.timezone) ?? 0) + 1);
    }
    const result = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0];
    return result?.[0] ?? 'Europe/Berlin';
  }

  private normalizeServiceCategories(input: string[]): ServiceCategory[] {
    const knownServices = new Set<ServiceCategory>([
      'residential',
      'office',
      'industrial',
      'windows',
      'disinfection',
      'eco_plus',
    ]);
    return input
      .map((value) => value.toLowerCase().trim() as ServiceCategory)
      .filter((value) => knownServices.has(value));
  }

  private async buildFallbackQueueMap(teamIds: string[]): Promise<Map<string, ProviderTeamFallbackMission[]>> {
    const map = new Map<string, ProviderTeamFallbackMission[]>();
    if (!teamIds.length) {
      return map;
    }

    const fallbackBookings = await this.prisma.booking.findMany({
      where: {
        fallbackTeamCandidateId: { in: teamIds },
        status: 'PENDING_PROVIDER',
      },
      select: {
        id: true,
        startAt: true,
        addressCity: true,
        requiredProviders: true,
        fallbackRequestedAt: true,
        fallbackTeamCandidateId: true,
      },
      orderBy: { fallbackRequestedAt: 'asc' },
    });

    for (const booking of fallbackBookings) {
      if (!booking.fallbackTeamCandidateId) {
        continue;
      }
      const entry: ProviderTeamFallbackMission = {
        bookingId: booking.id,
        startAt: booking.startAt.toISOString(),
        city: booking.addressCity ?? undefined,
        requiredProviders: booking.requiredProviders ?? 1,
        requestedAt: booking.fallbackRequestedAt?.toISOString() ?? null,
      };
      const existing = map.get(booking.fallbackTeamCandidateId) ?? [];
      existing.push(entry);
      map.set(booking.fallbackTeamCandidateId, existing);
    }

    return map;
  }
}
