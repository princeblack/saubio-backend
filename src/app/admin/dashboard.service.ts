import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, SupportPriority, SupportStatus } from '@prisma/client';
import type { AdminDashboardResponse } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  async getDashboard(): Promise<AdminDashboardResponse> {
    const now = new Date();
    const thirtyDaysAgo = this.daysAgo(30);

    const [
      activeProviders,
      pendingBookings,
      reviewAvg,
      revenueSum,
      bookingsWithAssignments,
      eligibleBookings,
      completedRecent,
      trackedBookings,
      resolvedTickets,
      providersMissingDocuments,
      topProvidersRaw,
      escalationsRaw,
      highPriorityTickets,
      overdueTickets,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          roles: { has: 'PROVIDER' },
          isActive: true,
        },
      }),
      this.prisma.booking.count({
        where: {
          status: {
            in: [BookingStatus.PENDING_PROVIDER, BookingStatus.PENDING_CLIENT],
          },
        },
      }),
      this.prisma.review.aggregate({
        _avg: { score: true },
      }),
      this.prisma.payment.aggregate({
        _sum: { platformFeeCents: true },
        where: { status: { in: [PaymentStatus.CAPTURED, PaymentStatus.RELEASED] } },
      }),
      this.prisma.booking.count({
        where: {
          startAt: { gte: thirtyDaysAgo },
          assignments: { some: {} },
        },
      }),
      this.prisma.booking.count({
        where: {
          startAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.booking.count({
        where: {
          status: BookingStatus.COMPLETED,
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.booking.count({
        where: {
          status: {
            in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED],
          },
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          status: SupportStatus.RESOLVED,
          updatedAt: { gte: thirtyDaysAgo },
        },
        select: {
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.providerProfile.count({
        where: {
          documents: {
            none: {},
          },
        },
      }),
      this.prisma.providerProfile.findMany({
        take: 3,
        orderBy: [
          { ratingAverage: 'desc' },
          { ratingCount: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          OR: [
            {
              priority: {
                in: [SupportPriority.HIGH, SupportPriority.URGENT],
              },
            },
            {
              status: {
                in: [SupportStatus.IN_PROGRESS, SupportStatus.WAITING_CUSTOMER],
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        include: {
          requester: { select: { firstName: true, lastName: true } },
          assignee: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          priority: { in: [SupportPriority.HIGH, SupportPriority.URGENT] },
          status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] },
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          dueAt: { lt: now },
          status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] },
        },
      }),
    ]);

    const satisfaction = reviewAvg._avg.score
      ? Math.round(((reviewAvg._avg.score ?? 0) / 5) * 100)
      : 0;
    const revenue = Number(((revenueSum._sum.platformFeeCents ?? 0) / 100).toFixed(2));
    const matching = eligibleBookings > 0 ? Math.round((bookingsWithAssignments / eligibleBookings) * 100) : 0;
    const onTime = trackedBookings > 0 ? Math.round((completedRecent / trackedBookings) * 100) : 0;
    const supportSlaHours = resolvedTickets.length
      ? Number(
          (
            resolvedTickets.reduce(
              (acc, ticket) => acc + (ticket.updatedAt.getTime() - ticket.createdAt.getTime()),
              0,
            ) /
            resolvedTickets.length /
            (1000 * 60 * 60)
          ).toFixed(1),
        )
      : 0;

    const alerts: AdminDashboardResponse['alerts'] = [
      {
        id: 'documents',
        label: 'Pending documents',
        description:
          providersMissingDocuments > 0
            ? `${providersMissingDocuments} provider(s) awaiting validation`
            : 'All provider files are validated',
        icon: '🛂',
        tone: providersMissingDocuments > 0 ? 'accent' : 'positive',
      },
      {
        id: 'disputes',
        label: 'Critical tickets',
        description:
          highPriorityTickets > 0
            ? `${highPriorityTickets} high priority ticket(s) open`
            : 'No critical ticket in progress',
        icon: '⚠️',
        tone: highPriorityTickets > 0 ? 'accent' : 'positive',
      },
      {
        id: 'overdue',
        label: 'Overdue cases',
        description:
          overdueTickets > 0
            ? `${overdueTickets} ticket(s) past due`
            : 'No overdue ticket at the moment',
        icon: '⏱',
        tone: overdueTickets > 0 ? 'accent' : 'positive',
      },
    ];

    const topProviders = topProvidersRaw.map((provider) => ({
      id: provider.id,
      name: [provider.user?.firstName, provider.user?.lastName].filter(Boolean).join(' ') || '—',
      rating: Number((provider.ratingAverage ?? 0).toFixed(2)),
      missions: provider._count.bookings,
    }));

    const escalations = escalationsRaw.map((ticket) => {
      const helper = [ticket.requester?.firstName, ticket.requester?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      return {
        id: ticket.id,
        subject: ticket.subject,
        helper: helper.length ? helper : undefined,
        status: ticket.status.toLowerCase(),
        priority: ticket.priority.toLowerCase(),
      };
    });

    return {
      metrics: {
        activeProviders,
        pendingBookings,
        satisfaction,
        revenue,
      },
      alerts,
      performance: {
        matching,
        onTime,
        supportSlaHours,
      },
      topProviders,
      escalations,
    };
  }
}
