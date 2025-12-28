import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DisputeStatus as PrismaDisputeStatus,
  Prisma,
  SupportCategory as PrismaSupportCategory,
  SupportPriority as PrismaSupportPriority,
  SupportStatus as PrismaSupportStatus,
  UserRole,
} from '@prisma/client';
import type {
  AdminSupportBookingRef,
  AdminSupportDisputeDetail,
  AdminSupportDisputeListItem,
  AdminSupportDisputeListResponse,
  AdminSupportMessage,
  AdminSupportOverviewResponse,
  AdminSupportSlaResponse,
  AdminSupportTicketDetail,
  AdminSupportTicketListItem,
  AdminSupportTicketListResponse,
  AdminSupportUserRef,
  BookingStatus,
  User,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SupportDisputeQueryDto,
  SupportDisputeUpdateDto,
  SupportPaginationQueryDto,
  SupportRangeQueryDto,
  SupportTicketMessageDto,
  SupportTicketQueryDto,
  SupportTicketUpdateDto,
} from './dto/admin-support.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 25;

const SUPPORT_BOOKING_SELECT = {
  id: true,
  status: true,
  service: true,
  startAt: true,
  addressCity: true,
  addressPostalCode: true,
  pricingTotalCents: true,
  pricingCurrency: true,
  client: { select: { firstName: true, lastName: true } },
  company: { select: { name: true } },
  assignments: {
    select: {
      provider: {
        select: {
          id: true,
          addressCity: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
} as const;

type SupportBookingSelectShape = typeof SUPPORT_BOOKING_SELECT;

type TicketBookingSummary = Prisma.BookingGetPayload<{ select: SupportBookingSelectShape }>;

type SupportTicketBaseRecord = Prisma.SupportTicketGetPayload<{
  include: {
    requester: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } };
    assignee: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } };
    _count: { select: { messages: true } };
  };
}>;

type SupportTicketWithRelations = SupportTicketBaseRecord & {
  booking?: TicketBookingSummary | null;
};

type SupportTicketDetailRecord = Prisma.SupportTicketGetPayload<{
  include: {
    requester: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } };
    assignee: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } };
    _count: { select: { messages: true } };
    messages: {
      include: {
        author: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } };
        attachments: { select: { id: true; url: true; filename: true } };
      };
    };
  };
}> & {
  booking?: TicketBookingSummary | null;
};

type DisputeWithRelations = Prisma.DisputeGetPayload<{
  include: {
    booking: { select: SupportBookingSelectShape };
    payment: { select: { amountCents: true; currency: true } };
    openedBy: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } };
    assignedTo: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } };
  };
}>;

type DisputeMessageRecord = Prisma.DisputeMessageGetPayload<{
  include: { author: { select: { id: true; firstName: true; lastName: true; email: true; roles: true } } };
}>;

@Injectable()
export class EmployeeSupportCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: SupportRangeQueryDto): Promise<AdminSupportOverviewResponse> {
    const { from, to } = this.resolveRange(query, 7);

    const [openTickets, urgentTickets, activeDisputes, resolvedTickets] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({
        where: { status: { notIn: [PrismaSupportStatus.RESOLVED, PrismaSupportStatus.CLOSED] } },
      }),
      this.prisma.supportTicket.count({
        where: {
          priority: { in: [PrismaSupportPriority.HIGH, PrismaSupportPriority.URGENT] },
          status: { notIn: [PrismaSupportStatus.RESOLVED, PrismaSupportStatus.CLOSED] },
        },
      }),
      this.prisma.dispute.count({
        where: { status: { notIn: [PrismaDisputeStatus.RESOLVED, PrismaDisputeStatus.REFUNDED, PrismaDisputeStatus.REJECTED] } },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          status: { in: [PrismaSupportStatus.RESOLVED, PrismaSupportStatus.CLOSED] },
          createdAt: { gte: from, lte: to },
        },
        select: { createdAt: true, updatedAt: true },
      }),
    ]);

    const ticketsInRange = await this.prisma.supportTicket.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { id: true, createdAt: true, priority: true, category: true },
    });

    const disputesInRange = await this.prisma.dispute.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { id: true, createdAt: true, reason: true },
    });

    const recentTicketsRaw = await this.prisma.supportTicket.findMany({
      where: { createdAt: { gte: from } },
      include: {
        requester: { select: { firstName: true, lastName: true } },
        assignee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    });

    const resolutionWithin24h =
      resolvedTickets.length === 0
        ? 0
        : Math.round(
            (resolvedTickets.filter((ticket) => {
              const diff = ticket.updatedAt.getTime() - ticket.createdAt.getTime();
              return diff <= 24 * 60 * 60 * 1000;
            }).length /
              resolvedTickets.length) *
              100
          );

    const timeline = this.buildTimeline(from, to, ticketsInRange, disputesInRange);
    const disputeReasons = this.buildReasonBreakdown(disputesInRange);

    return {
      metrics: {
        openTickets,
        urgentTickets,
        activeDisputes,
        resolution24hRate: resolutionWithin24h,
      },
      timeline,
      disputeReasons,
      recentTickets: recentTicketsRaw.map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        priority: this.mapPriority(ticket.priority),
        status: this.mapStatus(ticket.status),
        requester: this.formatName(ticket.requester),
        assignee: ticket.assignee ? this.formatName(ticket.assignee) : undefined,
        updatedAt: ticket.updatedAt.toISOString(),
      })),
    };
  }

  async getTickets(query: SupportTicketQueryDto): Promise<AdminSupportTicketListResponse> {
    const { page, pageSize } = this.resolvePagination(query);
    const where = this.buildTicketWhere(query);

    const [total, rawRecords] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        include: {
          requester: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
          assignee: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);

    const records = await this.enrichTicketsWithBooking(rawRecords as SupportTicketBaseRecord[]);

    return {
      page,
      pageSize,
      total,
      items: records.map((record) => this.mapTicket(record)),
    };
  }

  async getTicket(ticketId: string): Promise<AdminSupportTicketDetail> {
    const ticketRecord = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
            attachments: { select: { id: true, url: true, filename: true } },
          },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!ticketRecord) {
      throw new NotFoundException('SUPPORT_TICKET_NOT_FOUND');
    }

    const bookingMap = await this.fetchBookingsByIds(ticketRecord.bookingId ? [ticketRecord.bookingId] : []);
    const ticket: SupportTicketDetailRecord & { booking?: TicketBookingSummary | null } = {
      ...(ticketRecord as SupportTicketDetailRecord),
      booking: ticketRecord.bookingId ? bookingMap.get(ticketRecord.bookingId) ?? null : null,
    };

    return {
      ticket: this.mapTicket(ticket),
      messages: ticket.messages.map((message) => ({
        id: message.id,
        createdAt: message.createdAt.toISOString(),
        content: message.content,
        internal: message.internal,
        author: message.author ? this.mapUserRef(message.author) : undefined,
        attachments: message.attachments.map((attachment) => ({
          id: attachment.id,
          url: attachment.url,
          filename: attachment.filename,
        })),
      })),
    };
  }

  async updateTicket(ticketId: string, payload: SupportTicketUpdateDto): Promise<AdminSupportTicketListItem> {
    const ticketRecord = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: payload.status ? this.parseStatus(payload.status) : undefined,
        priority: payload.priority ? this.parsePriority(payload.priority) : undefined,
        assignee: payload.assigneeId === undefined ? undefined : payload.assigneeId ? { connect: { id: payload.assigneeId } } : { disconnect: true },
        dueAt: payload.dueAt === undefined ? undefined : payload.dueAt ? new Date(payload.dueAt) : null,
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
        _count: { select: { messages: true } },
      },
    });

    const bookingMap = await this.fetchBookingsByIds(ticketRecord.bookingId ? [ticketRecord.bookingId] : []);

    return this.mapTicket({
      ...(ticketRecord as SupportTicketBaseRecord),
      booking: ticketRecord.bookingId ? bookingMap.get(ticketRecord.bookingId) ?? null : null,
    });
  }

  async addTicketMessage(ticketId: string, payload: SupportTicketMessageDto, user: User): Promise<AdminSupportMessage> {
    await this.ensureTicket(ticketId);

    const message = await this.prisma.supportMessage.create({
      data: {
        content: payload.content,
        internal: payload.internal ?? false,
        ticket: { connect: { id: ticketId } },
        author: { connect: { id: user.id } },
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
      },
    });

    return {
      id: message.id,
      createdAt: message.createdAt.toISOString(),
      content: message.content,
      internal: message.internal,
      author: this.mapUserRef(message.author),
    };
  }

  async getDisputes(query: SupportDisputeQueryDto): Promise<AdminSupportDisputeListResponse> {
    const { page, pageSize } = this.resolvePagination(query);
    const bookingFilterIds = await this.resolveBookingIdsForFilters({
      clientId: query.clientId,
      providerId: query.providerId,
    });

    if (bookingFilterIds && bookingFilterIds.length === 0) {
      return { page, pageSize, total: 0, items: [] };
    }

    if (bookingFilterIds && query.bookingId && !bookingFilterIds.includes(query.bookingId)) {
      return { page, pageSize, total: 0, items: [] };
    }

    const where = this.buildDisputeWhere(query, bookingFilterIds);

    const [total, disputesRaw] = await this.prisma.$transaction([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
        where,
        include: {
          booking: { select: SUPPORT_BOOKING_SELECT },
          payment: { select: { amountCents: true, currency: true } },
          openedBy: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    const disputes = disputesRaw as DisputeWithRelations[];

    return {
      page,
      pageSize,
      total,
      items: disputes.map((dispute) => this.mapDispute(dispute)),
    };
  }

  async getDispute(disputeId: string): Promise<AdminSupportDisputeDetail> {
    const dispute = (await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: { select: SUPPORT_BOOKING_SELECT },
        payment: { select: { amountCents: true, currency: true } },
        openedBy: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true, roles: true } } },
        },
      },
    })) as (DisputeWithRelations & { messages: DisputeMessageRecord[] }) | null;

    if (!dispute) {
      throw new NotFoundException('DISPUTE_NOT_FOUND');
    }

    const base = this.mapDispute(dispute);

    return {
      ...base,
      description: dispute.description ?? null,
      resolution: dispute.resolution ?? null,
      adminNotes: dispute.adminNotes ?? null,
      assignedTo: dispute.assignedTo ? this.mapUserRef(dispute.assignedTo) : undefined,
      messages: dispute.messages.map((message) => ({
        id: message.id,
        createdAt: message.createdAt.toISOString(),
        message: message.message,
        role: message.role.toLowerCase() as 'client' | 'provider' | 'admin',
        author: message.author ? this.mapUserRef(message.author) : undefined,
      })),
    };
  }

  async updateDispute(disputeId: string, payload: SupportDisputeUpdateDto): Promise<AdminSupportDisputeDetail> {
    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: payload.status ? this.parseDisputeStatus(payload.status) : undefined,
        resolution: payload.resolution === undefined ? undefined : payload.resolution,
        refundAmountCents: payload.refundAmountCents === undefined ? undefined : payload.refundAmountCents,
        refundCurrency: payload.refundCurrency === undefined ? undefined : payload.refundCurrency,
        adminNotes: payload.adminNotes === undefined ? undefined : payload.adminNotes,
        assignedTo:
          payload.assignedToId === undefined
            ? undefined
            : payload.assignedToId
            ? { connect: { id: payload.assignedToId } }
            : { disconnect: true },
      },
    });

    return this.getDispute(disputeId);
  }

  async getSlaMetrics(query: SupportRangeQueryDto): Promise<AdminSupportSlaResponse> {
    const { from, to } = this.resolveRange(query, 30);

    const tickets = await this.prisma.supportTicket.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            createdAt: true,
            internal: true,
            author: { select: { roles: true } },
          },
        },
      },
    });

    const reviews = await this.prisma.review.aggregate({
      where: { createdAt: { gte: from } },
      _avg: { score: true },
      _count: { _all: true },
    });

    const firstResponses: number[] = [];
    const resolutionDurations: number[] = [];
    let resolvedWithin24 = 0;

    tickets.forEach((ticket) => {
      const firstResponse = ticket.messages.find((message) => this.isAgentMessage(message));
      if (firstResponse) {
        firstResponses.push(firstResponse.createdAt.getTime() - ticket.createdAt.getTime());
      }

      if (ticket.status === PrismaSupportStatus.RESOLVED || ticket.status === PrismaSupportStatus.CLOSED) {
        const diff = ticket.updatedAt.getTime() - ticket.createdAt.getTime();
        resolutionDurations.push(diff);
        if (diff <= 24 * 60 * 60 * 1000) {
          resolvedWithin24 += 1;
        }
      }
    });

    const averageFirstResponseMinutes =
      firstResponses.length > 0 ? Math.round(firstResponses.reduce((a, b) => a + b, 0) / firstResponses.length / 60000) : null;
    const averageResolutionHours =
      resolutionDurations.length > 0 ? Math.round((resolutionDurations.reduce((a, b) => a + b, 0) / resolutionDurations.length / 3600000) * 10) / 10 : null;
    const resolution24hRate =
      resolutionDurations.length > 0 ? Math.round((resolvedWithin24 / resolutionDurations.length) * 100) : null;

    const responseTrend = this.buildMonthlyTrend(tickets);
    const volumeByDay = this.buildWeekdayVolume(tickets);

    return {
      averageFirstResponseMinutes,
      averageResolutionHours,
      resolution24hRate,
      satisfactionScore: reviews._avg.score ? Number(reviews._avg.score.toFixed(2)) : null,
      feedbackSampleSize: reviews._count._all ?? 0,
      responseTrend,
      volumeByDay,
    };
  }

  private buildTicketWhere(query: SupportTicketQueryDto): Prisma.SupportTicketWhereInput {
    const where: Prisma.SupportTicketWhereInput = {};

    if (query.status) {
      where.status = this.parseStatus(query.status);
    }

    if (query.priority) {
      where.priority = this.parsePriority(query.priority);
    }

    if (query.category) {
      where.category = query.category.toUpperCase() as PrismaSupportCategory;
    }

    if (query.type) {
      where.requester = this.buildTypeFilter(query.type);
    }

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { bookingId: query.search },
      ];
    }

    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }

    if (query.requesterId) {
      where.requesterId = query.requesterId;
    }

    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    return where;
  }

  private buildDisputeWhere(query: SupportDisputeQueryDto, bookingIds?: string[]): Prisma.DisputeWhereInput {
    const where: Prisma.DisputeWhereInput = {};

    if (query.status) {
      where.status = this.parseDisputeStatus(query.status);
    }

    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }

    if (query.search) {
      where.OR = [
        { reason: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { bookingId: query.search },
      ];
    }

    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    if (!query.bookingId && bookingIds && bookingIds.length) {
      where.bookingId = bookingIds.length === 1 ? bookingIds[0] : { in: bookingIds };
    }

    return where;
  }

  private resolvePagination(query: SupportPaginationQueryDto) {
    const page = Math.max(1, Number(query.page ?? '1'));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? DEFAULT_PAGE_SIZE)));
    return { page, pageSize };
  }

  private resolveRange(query: SupportRangeQueryDto, defaultDays: number) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - defaultDays * DAY_MS);
    return { from, to };
  }

  private mapTicket(ticket: SupportTicketWithRelations): AdminSupportTicketListItem {
    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: this.mapStatus(ticket.status),
      priority: this.mapPriority(ticket.priority),
      category: ticket.category.toLowerCase() as AdminSupportTicketListItem['category'],
      requester: this.mapUserRef(ticket.requester),
      assignee: ticket.assignee ? this.mapUserRef(ticket.assignee) : undefined,
      booking: ticket.booking ? this.mapBooking(ticket.booking) : undefined,
      channel: 'app',
      updatedAt: ticket.updatedAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      dueAt: ticket.dueAt ? ticket.dueAt.toISOString() : null,
      messageCount: ticket._count.messages,
    };
  }

  private mapDispute(dispute: DisputeWithRelations): AdminSupportDisputeListItem {
    return {
      id: dispute.id,
      status: this.mapDisputeStatus(dispute.status),
      reason: dispute.reason,
      openedAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString(),
      booking: dispute.booking ? this.mapBooking(dispute.booking) : undefined,
      paymentAmountCents: dispute.payment?.amountCents ?? null,
      paymentCurrency: dispute.payment?.currency ?? dispute.booking?.pricingCurrency ?? 'EUR',
      refundAmountCents: dispute.refundAmountCents ?? null,
      refundCurrency: dispute.refundCurrency ?? null,
      resolution: dispute.resolution ?? null,
    };
  }

  private async resolveBookingIdsForFilters(filters: { clientId?: string; providerId?: string }): Promise<string[] | undefined> {
    const { clientId, providerId } = filters;
    if (!clientId && !providerId) {
      return undefined;
    }

    const where: Prisma.BookingWhereInput = {};
    if (clientId) {
      where.clientId = clientId;
    }
    if (providerId) {
      where.assignments = { some: { providerId } };
    }

    const rows = await this.prisma.booking.findMany({
      where,
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  private async fetchBookingsByIds(ids: string[]): Promise<Map<string, TicketBookingSummary>> {
    if (!ids.length) {
      return new Map();
    }
    const rows = (await this.prisma.booking.findMany({
      where: { id: { in: ids } },
      select: SUPPORT_BOOKING_SELECT,
    })) as TicketBookingSummary[];
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async enrichTicketsWithBooking(records: SupportTicketBaseRecord[]): Promise<SupportTicketWithRelations[]> {
    const bookingIds = Array.from(new Set(records.map((record) => record.bookingId).filter((id): id is string => Boolean(id))));
    const bookingMap = await this.fetchBookingsByIds(bookingIds);
    return records.map((record) => ({
      ...record,
      booking: record.bookingId ? bookingMap.get(record.bookingId) ?? null : null,
    }));
  }

  private mapUserRef(user: { id: string; firstName: string | null; lastName: string | null; email: string; roles?: UserRole[] }): AdminSupportUserRef {
    return {
      id: user.id,
      name: this.formatName(user),
      email: user.email,
      type: this.mapUserType(user.roles ?? []),
    };
  }

  private mapBooking(booking: TicketBookingSummary): AdminSupportBookingRef {
    const provider = booking.assignments[0]?.provider;
    return {
      id: booking.id,
      status: booking.status.toLowerCase() as BookingStatus,
      service: booking.service,
      startAt: booking.startAt.toISOString(),
      city: booking.addressCity ?? undefined,
      postalCode: booking.addressPostalCode ?? undefined,
      totalCents: booking.pricingTotalCents ?? null,
      currency: booking.pricingCurrency ?? null,
      clientName:
        booking.company?.name ??
        (booking.client ? `${booking.client.firstName ?? ''} ${booking.client.lastName ?? ''}`.trim() : undefined),
      providerName: provider ? `${provider.user.firstName ?? ''} ${provider.user.lastName ?? ''}`.trim() : undefined,
    };
  }

  private buildTimeline(from: Date, to: Date, tickets: Array<{ createdAt: Date }>, disputes: Array<{ createdAt: Date }>) {
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
    return Array.from({ length: days + 1 }).map((_, index) => {
      const dayStart = new Date(from.getTime() + index * DAY_MS);
      const label = dayStart.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
      return {
        date: label,
        tickets: tickets.filter((ticket) => this.isSameDay(ticket.createdAt, dayStart)).length,
        disputes: disputes.filter((dispute) => this.isSameDay(dispute.createdAt, dayStart)).length,
      };
    });
  }

  private buildReasonBreakdown(disputes: Array<{ reason: string }>) {
    const map = new Map<string, number>();
    disputes.forEach((entry) => {
      map.set(entry.reason, (map.get(entry.reason) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([reason, value]) => ({ reason, value }));
  }

  private buildMonthlyTrend(tickets: Array<{ createdAt: Date }>) {
    const map = new Map<string, number>();
    tickets.forEach((ticket) => {
      const key = `${ticket.createdAt.getFullYear()}-${ticket.createdAt.getMonth() + 1}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([key, value]) => {
      const [year, month] = key.split('-').map(Number);
      const label = new Date(year, month - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
      return { label, value };
    });
  }

  private buildWeekdayVolume(tickets: Array<{ createdAt: Date }>) {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const counters = days.map((label) => ({ label, value: 0 }));
    tickets.forEach((ticket) => {
      const day = ticket.createdAt.getDay(); // 0 Sunday
      const index = day === 0 ? 6 : day - 1;
      counters[index].value += 1;
    });
    return counters;
  }

  private buildTypeFilter(type: string): Prisma.UserWhereInput {
    switch (type) {
      case 'client':
        return { roles: { has: UserRole.CLIENT } };
      case 'provider':
        return { roles: { has: UserRole.PROVIDER } };
      case 'company':
        return { roles: { has: UserRole.COMPANY } };
      case 'employee':
        return { roles: { has: UserRole.EMPLOYEE } };
      default:
        return {};
    }
  }

  private mapStatus(status: PrismaSupportStatus): AdminSupportTicketListItem['status'] {
    return status.toLowerCase() as AdminSupportTicketListItem['status'];
  }

  private mapPriority(priority: PrismaSupportPriority): AdminSupportTicketListItem['priority'] {
    return priority.toLowerCase() as AdminSupportTicketListItem['priority'];
  }

  private mapDisputeStatus(status: PrismaDisputeStatus): AdminSupportDisputeListItem['status'] {
    return status.toLowerCase() as AdminSupportDisputeListItem['status'];
  }

  private parseStatus(status: string): PrismaSupportStatus {
    return status.toUpperCase() as PrismaSupportStatus;
  }

  private parsePriority(priority: string): PrismaSupportPriority {
    return priority.toUpperCase() as PrismaSupportPriority;
  }

  private parseDisputeStatus(status: string): PrismaDisputeStatus {
    return status.toUpperCase() as PrismaDisputeStatus;
  }

  private mapUserType(roles: UserRole[]): AdminSupportUserRef['type'] {
    if (roles.includes(UserRole.CLIENT)) return 'client';
    if (roles.includes(UserRole.PROVIDER)) return 'provider';
    if (roles.includes(UserRole.COMPANY)) return 'company';
    if (roles.includes(UserRole.EMPLOYEE) || roles.includes(UserRole.ADMIN)) return 'employee';
    return 'client';
  }

  private formatName(user: { firstName: string | null; lastName: string | null }): string {
    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return name || '—';
  }

  private isSameDay(value: Date, target: Date) {
    return value.getFullYear() === target.getFullYear() && value.getMonth() === target.getMonth() && value.getDate() === target.getDate();
  }

  private isAgentMessage(message: { internal: boolean; author?: { roles?: UserRole[] } }) {
    if (message.internal) {
      return true;
    }
    const roles = message.author?.roles ?? [];
    return roles.includes(UserRole.EMPLOYEE) || roles.includes(UserRole.ADMIN);
  }

  private async ensureTicket(id: string) {
    const exists = await this.prisma.supportTicket.count({ where: { id } });
    if (!exists) {
      throw new NotFoundException('SUPPORT_TICKET_NOT_FOUND');
    }
  }
}
