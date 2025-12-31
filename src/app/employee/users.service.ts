import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, UserRole as PrismaUserRole } from '@prisma/client';
import type {
  AdminClientDetails,
  AdminClientListItem,
  AdminPaginatedResponse,
  AdminProviderDetails,
  AdminProviderListItem,
  AdminRolesResponse,
  AdminUsersOverviewResponse,
  AdminEmployeeListItem,
  UserRole,
  ServiceCategory,
  BookingStatus as DomainBookingStatus,
  PaymentStatus as DomainPaymentStatus,
  PaymentMethod,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';

interface ListQueryParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

@Injectable()
export class EmployeeUsersService {
  private static readonly MAX_RECENT_USERS = 10;
  private static readonly OVERVIEW_WEEKS = 6;

  constructor(private readonly prisma: PrismaService) {}

  private formatUserName(user: { firstName?: string | null; lastName?: string | null; email: string }) {
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return fullName.length > 0 ? fullName : user.email;
  }

  public deriveStatus(user: { isActive: boolean; hashedPassword: string | null }): 'active' | 'invited' | 'suspended' {
    if (!user.isActive) return 'suspended';
    if (!user.hashedPassword) return 'invited';
    return 'active';
  }

  private buildPagination<T>(items: T[], total: number, page: number, pageSize: number): AdminPaginatedResponse<T> {
    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  private hasRole(roles: readonly string[] | null | undefined, role: string) {
    return roles?.some((value) => value.toUpperCase() === role.toUpperCase()) ?? false;
  }

  private normalizeRole(roles: readonly string[] | null | undefined): UserRole {
    const primary = roles?.[0]?.toLowerCase();
    if (primary === 'provider' || primary === 'employee' || primary === 'admin' || primary === 'company') {
      return primary as UserRole;
    }
    return 'client';
  }

  async getOverview(): Promise<AdminUsersOverviewResponse> {
    const [totalUsers, totalClients, totalProviders, totalEmployees, totalAdmins, providersReady, providersSuspended] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { roles: { has: 'CLIENT' } } }),
        this.prisma.user.count({ where: { roles: { has: 'PROVIDER' } } }),
        this.prisma.user.count({ where: { roles: { has: 'EMPLOYEE' } } }),
        this.prisma.user.count({ where: { roles: { has: 'ADMIN' } } }),
        this.prisma.providerProfile.count({ where: { onboardingStatus: 'ready', user: { isActive: true } } }),
        this.prisma.providerProfile.count({ where: { user: { isActive: false } } }),
      ]);

    const providersPending = Math.max(totalProviders - providersReady - providersSuspended, 0);

    const distribution = [
      { role: 'client' as const, value: totalClients },
      { role: 'provider' as const, value: totalProviders },
      { role: 'employee' as const, value: totalEmployees },
      { role: 'admin' as const, value: totalAdmins },
    ];

    const recentUsersRaw = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: EmployeeUsersService.MAX_RECENT_USERS,
    });

    const recent = recentUsersRaw.map((user) => ({
      id: user.id,
      name: this.formatUserName(user),
      email: user.email,
      role: this.normalizeRole(user.roles),
      status: this.deriveStatus(user),
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.updatedAt?.toISOString() ?? null,
    }));

    const timelineStart = this.getStartOfWeek(new Date(Date.now() - EmployeeUsersService.OVERVIEW_WEEKS * 7 * 24 * 60 * 60 * 1000));
    const timelineUsers = await this.prisma.user.findMany({
      where: { createdAt: { gte: timelineStart } },
      select: { createdAt: true, roles: true },
    });

    const timelineMap = new Map<string, { clients: number; providers: number }>();
    for (let i = 0; i < EmployeeUsersService.OVERVIEW_WEEKS; i += 1) {
      const date = new Date(timelineStart.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const key = date.toISOString();
      timelineMap.set(key, { clients: 0, providers: 0 });
    }

    for (const user of timelineUsers) {
      const bucketDate = this.getStartOfWeek(user.createdAt);
      const bucketKey = bucketDate.toISOString();
      if (!timelineMap.has(bucketKey)) {
        timelineMap.set(bucketKey, { clients: 0, providers: 0 });
      }
      const bucket = timelineMap.get(bucketKey)!;
      if (this.hasRole(user.roles, 'CLIENT')) bucket.clients += 1;
      if (this.hasRole(user.roles, 'PROVIDER')) bucket.providers += 1;
    }

    const timeline = [...timelineMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => ({
        date,
        clients: values.clients,
        providers: values.providers,
      }));

    return {
      stats: {
        totalUsers,
        clients: totalClients,
        providers: {
          total: totalProviders,
          active: providersReady,
          pending: providersPending,
          suspended: providersSuspended,
        },
        employees: totalEmployees,
        admins: totalAdmins,
      },
      distribution,
      recent,
      timeline,
    };
  }

  async listClients(params: ListQueryParams): Promise<AdminPaginatedResponse<AdminClientListItem>> {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 25, 1), 100);
    const where: Prisma.UserWhereInput = { roles: { has: 'CLIENT' } };

    this.applyUserStatusFilter(where, params.status);
    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          hashedPassword: true,
          roles: true,
          clientProfile: { select: { defaultLocale: true } },
          companyMemberships: { select: { companyId: true }, take: 1 },
          bookings: {
            orderBy: { startAt: 'desc' },
            take: 1,
            select: { id: true, startAt: true, status: true, pricingTotalCents: true },
          },
          _count: { select: { bookings: true } },
        },
      }),
    ]);

    const userIds = users.map((user) => user.id);
    const paymentGroups = userIds.length
      ? await this.prisma.payment.groupBy({
          by: ['clientId'],
          where: {
            clientId: { in: userIds },
            status: { in: [PaymentStatus.CAPTURED, PaymentStatus.RELEASED] },
          },
          _sum: { amountCents: true },
        })
      : [];
    const sumMap = new Map(paymentGroups.map((group) => [group.clientId, group._sum.amountCents ?? 0]));

    const items: AdminClientListItem[] = users.map((user) => {
      const lastBooking = user.bookings[0];
      return {
        id: user.id,
        name: this.formatUserName(user),
        email: user.email,
        phone: user.phone ?? null,
        createdAt: user.createdAt.toISOString(),
        status: this.deriveStatus(user),
        totalBookings: user._count.bookings,
        lastBooking: lastBooking
          ? {
              id: lastBooking.id,
              status: lastBooking.status.toLowerCase() as DomainBookingStatus,
              startAt: lastBooking.startAt.toISOString(),
              totalCents: lastBooking.pricingTotalCents,
            }
          : null,
        totalSpentCents: sumMap.get(user.id) ?? 0,
        type: this.hasRole(user.roles, 'COMPANY') || user.companyMemberships.length > 0 ? 'company' : 'individual',
      };
    });

    return this.buildPagination(items, total, page, pageSize);
  }

  async getClientDetails(id: string): Promise<AdminClientDetails> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
        isActive: true,
        hashedPassword: true,
        roles: true,
        clientProfile: { include: { addresses: true } },
      },
    });

    if (!user || !this.hasRole(user.roles, 'CLIENT')) {
      throw new NotFoundException('CLIENT_NOT_FOUND');
    }

    const [bookings, payments, totals, totalBookingsCount] = await Promise.all([
      this.prisma.booking.findMany({
        where: { clientId: id },
        orderBy: { startAt: 'desc' },
        take: 10,
        select: {
          id: true,
          service: true,
          status: true,
          startAt: true,
          pricingTotalCents: true,
          assignments: {
            take: 1,
            include: { provider: { select: { user: { select: { firstName: true, lastName: true } } } } },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          amountCents: true,
          status: true,
          createdAt: true,
          method: true,
          bookingId: true,
        },
      }),
      this.prisma.payment.aggregate({
        where: { clientId: id, status: { in: [PaymentStatus.CAPTURED, PaymentStatus.RELEASED] } },
        _sum: { amountCents: true },
      }),
      this.prisma.booking.count({ where: { clientId: id } }),
    ]);

    return {
      id: user.id,
      name: this.formatUserName(user),
      email: user.email,
      phone: user.phone ?? null,
      createdAt: user.createdAt.toISOString(),
      status: this.deriveStatus(user),
      type: this.hasRole(user.roles, 'COMPANY') ? 'company' : 'individual',
      addresses: (user.clientProfile?.addresses ?? []).map((address) => ({
        id: address.id,
        label: address.label,
        streetLine1: address.streetLine1,
        streetLine2: address.streetLine2 ?? null,
        postalCode: address.postalCode,
        city: address.city,
        countryCode: address.countryCode,
      })),
      lastBooking: bookings[0]
        ? {
            id: bookings[0].id,
            status: bookings[0].status.toLowerCase() as DomainBookingStatus,
            startAt: bookings[0].startAt.toISOString(),
            totalCents: bookings[0].pricingTotalCents,
          }
        : null,
      bookings: bookings.map((booking) => ({
        id: booking.id,
        status: booking.status.toLowerCase() as DomainBookingStatus,
        service: booking.service,
        startAt: booking.startAt.toISOString(),
        totalCents: booking.pricingTotalCents,
        providerName:
          booking.assignments[0]?.provider.user.firstName || booking.assignments[0]?.provider.user.lastName
            ? `${booking.assignments[0]?.provider.user.firstName ?? ''} ${booking.assignments[0]?.provider.user.lastName ?? ''}`.trim()
            : null,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        amountCents: payment.amountCents,
        status: payment.status.toLowerCase() as DomainPaymentStatus,
        createdAt: payment.createdAt.toISOString(),
        method: payment.method ? (payment.method.toLowerCase() as PaymentMethod) : null,
        bookingId: payment.bookingId,
      })),
      totalSpentCents: totals._sum.amountCents ?? 0,
      totalBookings: totalBookingsCount,
    };
  }

  async listProviders(params: ListQueryParams): Promise<AdminPaginatedResponse<AdminProviderListItem>> {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 25, 1), 100);

    const where: Prisma.ProviderProfileWhereInput = {};
    if (params.status === 'active') {
      where.onboardingStatus = 'ready';
      where.user = { isActive: true };
    } else if (params.status === 'pending') {
      where.onboardingStatus = { not: 'ready' };
    } else if (params.status === 'suspended') {
      where.user = { isActive: false };
    }

    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { user: { firstName: { contains: term, mode: 'insensitive' } } },
        { user: { lastName: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, providers] = await this.prisma.$transaction([
      this.prisma.providerProfile.count({ where }),
      this.prisma.providerProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          providerType: true,
          onboardingStatus: true,
          identityVerificationStatus: true,
          payoutActivationStatus: true,
          payoutReady: true,
          ratingAverage: true,
          ratingCount: true,
          addressCity: true,
          addressPostalCode: true,
          serviceCategories: true,
          serviceAreas: true,
          languages: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              isActive: true,
              createdAt: true,
              hashedPassword: true,
            },
          },
        },
      }),
    ]);

    const providerIds = providers.map((provider) => provider.id);
    const completedAssignments = providerIds.length
      ? await this.prisma.bookingAssignment.groupBy({
          by: ['providerId'],
          where: {
            providerId: { in: providerIds },
            booking: { status: BookingStatus.COMPLETED },
          },
          _count: { _all: true },
        })
      : [];
    const assignmentMap = new Map(completedAssignments.map((entry) => [entry.providerId, entry._count._all]));

    const items: AdminProviderListItem[] = providers.map((provider) => ({
      id: provider.id,
      name: this.formatUserName(provider.user),
      email: provider.user.email,
      phone: provider.user.phone ?? null,
      onboardingStatus: provider.onboardingStatus,
      identityStatus: provider.identityVerificationStatus,
      payoutStatus: provider.payoutActivationStatus,
      ratingAverage: provider.ratingAverage ?? 0,
      ratingCount: provider.ratingCount ?? 0,
      missionsCompleted: assignmentMap.get(provider.id) ?? 0,
      city: provider.addressCity ?? null,
      postalCode: provider.addressPostalCode ?? null,
      serviceCategories: (provider.serviceCategories ?? []) as ServiceCategory[],
      status: this.deriveStatus({ isActive: provider.user.isActive, hashedPassword: provider.user.hashedPassword }),
      payoutReady: provider.payoutReady,
    }));

    return this.buildPagination(items, total, page, pageSize);
  }

  async getProviderDetails(id: string): Promise<AdminProviderDetails> {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id },
      select: {
        id: true,
        providerType: true,
        onboardingStatus: true,
        identityVerificationStatus: true,
        payoutActivationStatus: true,
        payoutReady: true,
        ratingAverage: true,
        ratingCount: true,
        serviceCategories: true,
        serviceAreas: true,
        languages: true,
        addressStreetLine1: true,
        addressPostalCode: true,
        addressCity: true,
        addressRegion: true,
        payoutAccountHolder: true,
        payoutIbanMasked: true,
        payoutBankName: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
            isActive: true,
            hashedPassword: true,
          },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('PROVIDER_NOT_FOUND');
    }

    const assignments = await this.prisma.bookingAssignment.count({
      where: { providerId: id, booking: { status: BookingStatus.COMPLETED } },
    });

    return {
      id: provider.id,
      name: this.formatUserName(provider.user),
      email: provider.user.email,
      phone: provider.user.phone ?? null,
      createdAt: provider.user.createdAt.toISOString(),
      city: provider.addressCity ?? null,
      postalCode: provider.addressPostalCode ?? null,
      status: this.deriveStatus({ isActive: provider.user.isActive, hashedPassword: provider.user.hashedPassword ?? null }),
      onboardingStatus: provider.onboardingStatus,
      identityStatus: provider.identityVerificationStatus,
      payoutStatus: provider.payoutActivationStatus,
      serviceCategories: (provider.serviceCategories ?? []) as ServiceCategory[],
      serviceAreas: provider.serviceAreas ?? [],
      languages: provider.languages ?? [],
      ratingAverage: provider.ratingAverage ?? 0,
      ratingCount: provider.ratingCount ?? 0,
      missionsCompleted: assignments,
      payoutReady: provider.payoutReady,
      payoutDetails: {
        accountHolder: provider.payoutAccountHolder ?? null,
        ibanMasked: provider.payoutIbanMasked ?? null,
        bankName: provider.payoutBankName ?? null,
      },
      address: {
        streetLine1: provider.addressStreetLine1 ?? null,
        postalCode: provider.addressPostalCode ?? null,
        city: provider.addressCity ?? null,
        region: provider.addressRegion ?? null,
      },
    };
  }

  async listEmployees(params: ListQueryParams): Promise<AdminPaginatedResponse<AdminEmployeeListItem>> {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 25, 1), 100);
    const where: Prisma.UserWhereInput = { roles: { has: 'EMPLOYEE' } };
    this.applyUserStatusFilter(where, params.status);

    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          updatedAt: true,
          isActive: true,
          hashedPassword: true,
          roles: true,
          employeeProfiles: { select: { role: true }, take: 1 },
        },
      }),
    ]);

    const items: AdminEmployeeListItem[] = users.map((user) => ({
      id: user.id,
      name: this.formatUserName(user),
      email: user.email,
      role: user.employeeProfiles[0]?.role ?? 'Employee',
      accessRole: (user.roles[0]?.toLowerCase() ?? 'employee') as UserRole,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.updatedAt?.toISOString() ?? null,
      status: this.deriveStatus(user),
    }));

    return this.buildPagination(items, total, page, pageSize);
  }

  private applyUserStatusFilter(where: Prisma.UserWhereInput, status?: string) {
    if (status === 'active') {
      where.isActive = true;
      where.hashedPassword = { not: null };
    } else if (status === 'invited') {
      where.hashedPassword = null;
    } else if (status === 'suspended') {
      where.isActive = false;
    }
  }

  private getStartOfWeek(date: Date): Date {
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = result.getUTCDay() || 7;
    result.setUTCDate(result.getUTCDate() - day + 1);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }
}
