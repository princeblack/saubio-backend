import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type {
  ProviderAvailabilitySlot,
  ProviderProfile,
  ProviderTeam,
  ProviderTeamMember,
  ProviderTimeOff,
  TeamPlan,
  TeamPlanSlot,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';

type TeamMemberContext = ProviderTeamMember & {
  provider: ProviderProfile & {
    availabilitySlots: ProviderAvailabilitySlot[];
    timeOffPeriods: ProviderTimeOff[];
  };
};

type TeamContext = ProviderTeam & { members: TeamMemberContext[] };

@Injectable()
export class TeamPlanningService {
  private readonly logger = new Logger(TeamPlanningService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *')
  async refreshRollingPlans() {
    const teams = await this.prisma.providerTeam.findMany({
      select: { id: true },
    });
    const start = DateTime.now().startOf('day');
    const end = start.plus({ days: 14 });
    for (const team of teams) {
      try {
        await this.generatePlansForRange(team.id, start.toJSDate(), end.toJSDate());
      } catch (error) {
        this.logger.warn(
          `Team plan refresh failed for ${team.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  async generatePlansForRange(teamId: string, start: Date, end: Date) {
    const context = await this.loadTeam(teamId);
    if (!context) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }
    const { startDay, endDay } = this.normalizeRange(start, end, this.resolveTimezone(context));
    let cursor = startDay;
    while (cursor <= endDay) {
      await this.upsertPlanForDay(context, cursor);
      cursor = cursor.plus({ days: 1 });
    }
  }

  async ensureSlot(teamId: string, startAt: Date, endAt: Date): Promise<TeamPlanSlot> {
    const context = await this.loadTeam(teamId);
    if (!context) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }
    if (!context.members.length) {
      throw new BadRequestException('TEAM_HAS_NO_MEMBERS');
    }
    if (endAt <= startAt) {
      throw new BadRequestException('TEAM_SLOT_RANGE_INVALID');
    }

    const available = this.countMembersForWindow(context, startAt, endAt);
    if (available <= 0) {
      throw new BadRequestException('TEAM_UNAVAILABLE_FOR_SLOT');
    }

    const timezone = this.resolveTimezone(context);
    const plan = await this.upsertPlanForDay(
      context,
      DateTime.fromJSDate(startAt).setZone(timezone).startOf('day')
    );

    let slot = await this.prisma.teamPlanSlot.findFirst({
      where: { teamPlanId: plan.id, startAt, endAt },
    });
    if (slot) {
      if (slot.capacity !== available) {
        slot = await this.prisma.teamPlanSlot.update({
          where: { id: slot.id },
          data: { capacity: available },
        });
      }
      return slot;
    }

    return this.prisma.teamPlanSlot.create({
      data: {
        teamPlanId: plan.id,
        startAt,
        endAt,
        capacity: available,
      },
    });
  }

  private async loadTeam(teamId: string): Promise<TeamContext | null> {
    return this.prisma.providerTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            provider: {
              include: {
                availabilitySlots: {
                  where: { isActive: true },
                },
                timeOffPeriods: true,
              },
            },
          },
        },
      },
    });
  }

  private async upsertPlanForDay(team: TeamContext, day: DateTime): Promise<TeamPlan> {
    const timezone = this.resolveTimezone(team);
    const dayUtc = day.setZone(timezone).startOf('day').toUTC().toJSDate();
    const availableCount = this.countMembersForDay(team, day);
    const capacity = Math.min(availableCount, this.resolveCapacityCap(team));

    return this.prisma.teamPlan.upsert({
      where: {
        providerTeamId_date: {
          providerTeamId: team.id,
          date: dayUtc,
        },
      },
      create: {
        providerTeamId: team.id,
        date: dayUtc,
        capacitySlots: capacity,
      },
      update: {
        capacitySlots: capacity,
      },
    });
  }

  private countMembersForDay(team: TeamContext, day: DateTime): number {
    const timezone = this.resolveTimezone(team);
    const dayStartUtc = day.setZone(timezone).startOf('day').toUTC().toJSDate();
    const dayEndUtc = day.setZone(timezone).endOf('day').toUTC().toJSDate();
    const weekday = this.normalizeWeekday(day.weekday);
    let count = 0;
    for (const member of team.members) {
      if (
        member.provider.availabilitySlots.some((slot) => slot.weekday === weekday) &&
        !this.hasTimeOff(member.provider.timeOffPeriods, dayStartUtc, dayEndUtc)
      ) {
        count += 1;
      }
    }
    return count;
  }

  private countMembersForWindow(team: TeamContext, startAt: Date, endAt: Date): number {
    const cap = this.resolveCapacityCap(team);
    let count = 0;
    for (const member of team.members) {
      if (this.memberCoversWindow(member, startAt, endAt)) {
        count += 1;
        if (count >= cap) {
          return cap;
        }
      }
    }
    return Math.min(count, cap);
  }

  private memberCoversWindow(
    member: TeamMemberContext,
    startAt: Date,
    endAt: Date
  ): boolean {
    if (this.hasTimeOff(member.provider.timeOffPeriods, startAt, endAt)) {
      return false;
    }
    return member.provider.availabilitySlots.some((slot) => this.slotCoversWindow(slot, startAt, endAt));
  }

  private slotCoversWindow(slot: ProviderAvailabilitySlot, startAt: Date, endAt: Date): boolean {
    const timezone = slot.timezone ?? 'Europe/Berlin';
    const startLocal = DateTime.fromJSDate(startAt).setZone(timezone);
    const endLocal = DateTime.fromJSDate(endAt).setZone(timezone);
    const startWeekday = this.normalizeWeekday(startLocal.weekday);
    const endWeekday = this.normalizeWeekday(endLocal.weekday);
    if (startWeekday !== slot.weekday || endWeekday !== slot.weekday) {
      return false;
    }
    const startMinutes = startLocal.hour * 60 + startLocal.minute;
    const endMinutes = endLocal.hour * 60 + endLocal.minute;
    return startMinutes >= slot.startMinutes && endMinutes <= slot.endMinutes;
  }

  private hasTimeOff(periods: ProviderTimeOff[], startAt: Date, endAt: Date): boolean {
    if (!periods.length) {
      return false;
    }
    return periods.some((period) => period.startAt < endAt && period.endAt > startAt);
  }

  private resolveTimezone(team: Pick<ProviderTeam, 'timezone'>): string {
    return team.timezone ?? 'Europe/Berlin';
  }

  private resolveCapacityCap(team: TeamContext): number {
    const memberCount = team.members.length;
    if (team.defaultDailyCapacity && team.defaultDailyCapacity > 0) {
      return memberCount > 0
        ? Math.min(team.defaultDailyCapacity, memberCount)
        : 0;
    }
    return memberCount;
  }

  private normalizeRange(start: Date, end: Date, timezone: string) {
    let startDay = DateTime.fromJSDate(start).setZone(timezone).startOf('day');
    let endDay = DateTime.fromJSDate(end).setZone(timezone).startOf('day');
    if (endDay < startDay) {
      [startDay, endDay] = [endDay, startDay];
    }
    return { startDay, endDay };
  }

  private normalizeWeekday(weekday: number): number {
    return weekday === 7 ? 0 : weekday;
  }
}
