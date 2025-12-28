import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminOperationsMetrics } from '@saubio/models';
import { BookingMapper } from '../bookings/booking.mapper';

@Injectable()
export class EmployeeOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  async getOperations(): Promise<AdminOperationsMetrics> {
    const now = new Date();
    const sevenDaysAgo = this.daysAgo(7);
    const prevSevenDays = this.daysAgo(14);

    const [bookingsCurrent, bookingsPrevious, openTickets, providersActive, paymentsCaptured, fallbackQueueRaw] =
      await Promise.all([
        this.prisma.booking.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        this.prisma.booking.count({ where: { createdAt: { gte: prevSevenDays, lt: sevenDaysAgo } } }),
        this.prisma.supportTicket.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
        this.prisma.providerProfile.count({ where: { bookings: { some: { booking: { status: 'IN_PROGRESS' } } } } }),
        this.prisma.payment.aggregate({
          _sum: { platformFeeCents: true },
          where: { status: 'CAPTURED', createdAt: { gte: sevenDaysAgo } },
        }),
        this.prisma.booking.findMany({
          where: {
            status: 'PENDING_PROVIDER',
            fallbackRequestedAt: { not: null },
          },
          orderBy: [
            { fallbackEscalatedAt: 'desc' },
            { fallbackRequestedAt: 'asc' },
          ],
          take: 15,
          include: {
            fallbackTeamCandidate: {
              include: { members: true },
            },
          },
        }),
      ]);

    const bookingsTrend = bookingsPrevious === 0 ? 0 : ((bookingsCurrent - bookingsPrevious) / bookingsPrevious) * 100;
    const paymentsValue = (paymentsCaptured._sum.platformFeeCents ?? 0) / 100;

    const metrics = [
      {
        id: 'bookings-week',
        label: 'Bookings (7d)',
        value: bookingsCurrent.toString(),
        trend: Number(bookingsTrend.toFixed(1)),
      },
      {
        id: 'open-tickets',
        label: 'Open support tickets',
        value: openTickets.toString(),
        trend: 0,
      },
      {
        id: 'providers-active',
        label: 'Providers live',
        value: providersActive.toString(),
        trend: 0,
      },
      {
        id: 'revenue-week',
        label: 'Platform fees (7d)',
        value: `€${paymentsValue.toFixed(0)}`,
        trend: 0,
      },
    ];

    const services: AdminOperationsMetrics['services'] = [
      {
        id: 'bookings-api',
        name: 'Bookings API',
        status: openTickets > 10 ? 'degraded' : 'operational',
        latencyMs: 180,
        lastIncidentAt: undefined,
      },
      {
        id: 'notifications',
        name: 'Notifications',
        status: 'operational',
        latencyMs: 95,
        lastIncidentAt: undefined,
      },
      {
        id: 'payments',
        name: 'Payments service',
        status: 'operational',
        latencyMs: 220,
        lastIncidentAt: undefined,
      },
    ];

    const incidentsRaw = await this.prisma.supportTicket.findMany({
      where: {
        priority: { in: ['HIGH', 'URGENT'] },
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 3,
    });

    const incidents: AdminOperationsMetrics['incidents'] = incidentsRaw.map((ticket) => ({
      id: ticket.id,
      title: ticket.subject,
      severity: ticket.priority === 'URGENT' ? 'critical' : 'major',
      detectedAt: ticket.createdAt.toISOString(),
      status: ticket.status === 'WAITING_CUSTOMER' ? 'monitoring' : 'open',
      owner: 'Support',
    }));

    const analytics = [
      { id: 'bookings-total', label: 'Bookings total', value: bookingsCurrent, unit: '' },
      { id: 'payments-total', label: 'Platform fees (EUR)', value: Number(paymentsValue.toFixed(0)), unit: '€' },
      { id: 'tickets-open', label: 'Open tickets', value: openTickets, unit: '' },
      { id: 'providers-active', label: 'Active providers', value: providersActive, unit: '' },
    ];

    const fallbackQueue: AdminOperationsMetrics['fallbackQueue'] = fallbackQueueRaw.map((booking) => ({
      bookingId: booking.id,
      status: BookingMapper.toDomainStatus(booking.status),
      service: BookingMapper.toDomainService(booking.service),
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      city: booking.addressCity ?? undefined,
      requiredProviders: booking.requiredProviders ?? 1,
      matchingRetryCount: booking.matchingRetryCount ?? 0,
      fallbackRequestedAt: booking.fallbackRequestedAt?.toISOString() ?? null,
      fallbackEscalatedAt: booking.fallbackEscalatedAt?.toISOString() ?? null,
      teamCandidate: booking.fallbackTeamCandidate
        ? {
            id: booking.fallbackTeamCandidate.id,
            name: booking.fallbackTeamCandidate.name,
            preferredSize: booking.fallbackTeamCandidate.preferredSize ?? undefined,
            memberCount: booking.fallbackTeamCandidate.members.length,
          }
        : null,
    }));

    return {
      metrics,
      services,
      incidents,
      analytics,
      fallbackQueue,
    };
  }
}
