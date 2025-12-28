import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, SupportPriority, SupportStatus } from '@prisma/client';
import type { AdminDashboardResponse, AdminDashboardOverview } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmployeeDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  private startOfDay(date: Date) {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

  private startOfWeek(date: Date) {
    const clone = this.startOfDay(date);
    const day = clone.getDay();
    const diff = (day + 6) % 7;
    clone.setDate(clone.getDate() - diff);
    return clone;
  }

  private addDays(date: Date, amount: number) {
    const clone = new Date(date);
    clone.setDate(clone.getDate() + amount);
    return clone;
  }

  private formatDate(date: Date) {
    return date.toISOString().split('T')[0]!;
  }

  private centsToEuros(value?: number | null) {
    if (!value) {
      return 0;
    }
    return Number((value / 100).toFixed(2));
  }

  async getDashboard(): Promise<AdminDashboardResponse> {
    const now = new Date();
    const thirtyDaysAgo = this.daysAgo(30);
    const startOfToday = this.startOfDay(now);
    const endOfToday = this.addDays(startOfToday, 1);
    const startOfWeek = this.startOfWeek(now);
    const endOfWeek = this.addDays(startOfWeek, 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const bookingsChartDays = 14;
    const bookingsChartStart = this.addDays(startOfToday, -(bookingsChartDays - 1));
    const revenueChartWeeks = 8;
    const revenueChartStart = this.addDays(this.startOfWeek(now), -(revenueChartWeeks - 1) * 7);
    const successPaymentStatuses = [PaymentStatus.CAPTURED, PaymentStatus.RELEASED];
    const pendingPaymentStatuses = [
      PaymentStatus.PENDING,
      PaymentStatus.REQUIRES_ACTION,
      PaymentStatus.AUTHORIZED,
      PaymentStatus.CAPTURE_PENDING,
      PaymentStatus.HELD,
    ];
    const failedPaymentStatuses = [PaymentStatus.FAILED, PaymentStatus.DISPUTED];
    const refundedPaymentStatuses = [PaymentStatus.REFUNDED];

    const [
      totalUsers,
      providersActive,
      providersInactive,
      clientsTotal,
      employeesTotal,
      adminsTotal,
      totalBookings,
      bookingsToday,
      bookingsThisWeek,
      bookingsThisMonth,
      bookingStatusGroup,
      shortNoticeCount,
      revenueTodayAgg,
      revenueWeekAgg,
      revenueMonthAgg,
      paymentStatusGroup,
      completedFinancials,
      bookingsRecentRecords,
      paymentsRecentRecords,
      providersWithUpcomingAssignments,
      reviewAvg,
      platformRevenueSum,
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
      this.prisma.user.count(),
      this.prisma.user.count({ where: { roles: { has: 'PROVIDER' }, isActive: true } }),
      this.prisma.user.count({ where: { roles: { has: 'PROVIDER' }, isActive: false } }),
      this.prisma.user.count({ where: { roles: { has: 'CLIENT' } } }),
      this.prisma.user.count({ where: { roles: { has: 'EMPLOYEE' } } }),
      this.prisma.user.count({ where: { roles: { has: 'ADMIN' } } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({
        where: { createdAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.booking.count({
        where: { createdAt: { gte: startOfWeek, lt: endOfWeek } },
      }),
      this.prisma.booking.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.booking.count({ where: { shortNotice: true } }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: successPaymentStatuses }, occurredAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: successPaymentStatuses }, occurredAt: { gte: startOfWeek } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: successPaymentStatuses }, occurredAt: { gte: startOfMonth } },
      }),
      this.prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.booking.aggregate({
        _sum: { pricingTotalCents: true },
        _count: { _all: true },
        where: { status: BookingStatus.COMPLETED },
      }),
      this.prisma.booking.findMany({
        where: { createdAt: { gte: bookingsChartStart } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: {
          status: { in: successPaymentStatuses },
          occurredAt: { gte: revenueChartStart },
        },
        select: { occurredAt: true, amountCents: true },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.bookingAssignment.findMany({
        where: {
          booking: {
            startAt: { gte: now, lt: this.addDays(now, 7) },
            status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
          },
        },
        select: { providerId: true },
        distinct: ['providerId'],
      }),
      this.prisma.review.aggregate({
        _avg: { score: true },
      }),
      this.prisma.payment.aggregate({
        _sum: { platformFeeCents: true },
        where: { status: { in: successPaymentStatuses } },
      }),
      this.prisma.booking.count({
        where: {
          startAt: { gte: thirtyDaysAgo },
          assignments: { some: {} },
        },
      }),
      this.prisma.booking.count({
        where: { startAt: { gte: thirtyDaysAgo } },
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

    const bookingsByStatus = bookingStatusGroup.reduce<Record<BookingStatus, number>>((acc, group) => {
      acc[group.status] = group._count._all;
      return acc;
    }, {} as Record<BookingStatus, number>);

    const pendingBookings =
      (bookingsByStatus[BookingStatus.PENDING_CLIENT] ?? 0) + (bookingsByStatus[BookingStatus.PENDING_PROVIDER] ?? 0);
    const cancellationRate =
      totalBookings > 0 ? Number((((bookingsByStatus[BookingStatus.CANCELLED] ?? 0) / totalBookings) * 100).toFixed(1)) : 0;
    const conversionBase = totalBookings - (bookingsByStatus[BookingStatus.DRAFT] ?? 0);
    const conversionNumerator =
      (bookingsByStatus[BookingStatus.CONFIRMED] ?? 0) +
      (bookingsByStatus[BookingStatus.IN_PROGRESS] ?? 0) +
      (bookingsByStatus[BookingStatus.COMPLETED] ?? 0);
    const conversionRate =
      conversionBase > 0 ? Number(((conversionNumerator / conversionBase) * 100).toFixed(1)) : 0;
    const shortNoticePercentage =
      totalBookings > 0 ? Number(((shortNoticeCount / totalBookings) * 100).toFixed(1)) : 0;

    const paymentsStatusMap = paymentStatusGroup.reduce<Record<PaymentStatus, number>>((acc, group) => {
      acc[group.status] = group._count._all;
      return acc;
    }, {} as Record<PaymentStatus, number>);
    const sumStatuses = (statuses: PaymentStatus[]) =>
      statuses.reduce((total, status) => total + (paymentsStatusMap[status] ?? 0), 0);
    const paymentsSummary = {
      succeeded: sumStatuses(successPaymentStatuses),
      pending: sumStatuses(pendingPaymentStatuses),
      failed: sumStatuses(failedPaymentStatuses),
      refunded: sumStatuses(refundedPaymentStatuses),
    };

    const bookingsByDate = bookingsRecentRecords.reduce<Record<string, number>>((acc, booking) => {
      const key = this.formatDate(booking.createdAt);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const bookingsPerDay = Array.from({ length: bookingsChartDays }, (_, index) => {
      const date = this.addDays(bookingsChartStart, index);
      const key = this.formatDate(date);
      return { date: key, value: bookingsByDate[key] ?? 0 };
    });

    const revenueByWeek = paymentsRecentRecords.reduce<Record<string, number>>((acc, payment) => {
      const key = this.formatDate(this.startOfWeek(payment.occurredAt));
      acc[key] = (acc[key] ?? 0) + payment.amountCents;
      return acc;
    }, {});
    const revenuePerWeek = Array.from({ length: revenueChartWeeks }, (_, index) => {
      const weekStart = this.addDays(revenueChartStart, index * 7);
      const key = this.formatDate(weekStart);
      return { date: key, value: this.centsToEuros(revenueByWeek[key] ?? 0) };
    });

    const averageBasket =
      completedFinancials._count._all > 0
        ? this.centsToEuros(completedFinancials._sum.pricingTotalCents ?? 0) / completedFinancials._count._all
        : 0;
    const busyProviders = providersWithUpcomingAssignments.length;
    const occupancyRate =
      providersActive > 0 ? Number(((busyProviders / providersActive) * 100).toFixed(1)) : 0;

    const overview: AdminDashboardOverview = {
      users: {
        total: totalUsers,
        providers: {
          total: providersActive + providersInactive,
          active: providersActive,
          inactive: providersInactive,
        },
        clients: clientsTotal,
        employees: employeesTotal,
        admins: adminsTotal,
      },
      bookings: {
        total: totalBookings,
        today: bookingsToday,
        thisWeek: bookingsThisWeek,
        thisMonth: bookingsThisMonth,
        statuses: {
          draft: bookingsByStatus[BookingStatus.DRAFT] ?? 0,
          pending: pendingBookings,
          confirmed: bookingsByStatus[BookingStatus.CONFIRMED] ?? 0,
          cancelled: bookingsByStatus[BookingStatus.CANCELLED] ?? 0,
          completed: bookingsByStatus[BookingStatus.COMPLETED] ?? 0,
        },
        shortNotice: {
          total: shortNoticeCount,
          percentage: shortNoticePercentage,
        },
        cancellationRate,
        conversionRate,
      },
      finances: {
        revenue: {
          today: this.centsToEuros(revenueTodayAgg._sum.amountCents),
          week: this.centsToEuros(revenueWeekAgg._sum.amountCents),
          month: this.centsToEuros(revenueMonthAgg._sum.amountCents),
        },
        payments: paymentsSummary,
        averageBasket: Number(averageBasket.toFixed(2)),
      },
      charts: {
        bookingsPerDay,
        revenuePerWeek,
      },
      operations: {
        occupancyRate,
        busyProviders,
        shortNoticeRatio: shortNoticePercentage,
      },
    };

    const satisfaction = reviewAvg._avg.score
      ? Math.round(((reviewAvg._avg.score ?? 0) / 5) * 100)
      : 0;
    const revenue = this.centsToEuros(platformRevenueSum._sum.platformFeeCents);
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
        activeProviders: providersActive,
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
      overview,
    };
  }
}
