import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingLocksService } from './booking-locks.service';
import { TeamPlanningService } from './team-planning.service';
import { BookingMatchingService } from './booking-matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { seedDemoDatabase } from '@saubio/prisma/seed';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { ExecutionContext } from '@nestjs/common';
import type { User } from '@saubio/models';
import { BookingNotificationsService } from './booking-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { ProviderType } from '@prisma/client';
import { PaymentsService } from '../payments/payments.service';

class InMemoryPrismaService {
  private bookings = new Map<string, any>();
  providerProfile = {
    findMany: async () => [],
  };
  bookingAssignment = {
    findMany: async () => [],
    groupBy: async () => [],
    deleteMany: async () => ({ count: 0 }),
    createMany: async () => ({ count: 0 }),
  };

  booking = {
    findMany: async ({ include }: any = {}) =>
      Array.from(this.bookings.values()).map((record) => this.withInclude(record, include)),
    findUnique: async ({ where: { id }, include }: any) => {
      const record = this.bookings.get(id);
      if (!record) return null;
      return this.withInclude(record, include);
    },
    create: async ({ data, include }: any) => {
      const now = new Date();
      const id = `booking_${this.bookings.size + 1}`;
      const record = {
        id,
        createdAt: now,
        updatedAt: now,
        clientId: data.client.connect.id,
        companyId: data.company?.connect?.id ?? null,
        service: data.service,
        surfacesSquareMeters: data.surfacesSquareMeters,
        startAt: data.startAt,
        endAt: data.endAt,
        frequency: data.frequency,
        mode: data.mode,
        ecoPreference: data.ecoPreference,
        addressStreetLine1: data.addressStreetLine1,
        addressStreetLine2: data.addressStreetLine2 ?? null,
        addressPostalCode: data.addressPostalCode,
        addressCity: data.addressCity,
        addressCountryCode: data.addressCountryCode,
        addressAccessNotes: data.addressAccessNotes ?? null,
        status: data.status,
        pricingSubtotalCents: data.pricingSubtotalCents,
        pricingEcoCents: data.pricingEcoCents,
        pricingExtrasCents: data.pricingExtrasCents,
        pricingTaxCents: data.pricingTaxCents,
        pricingCurrency: data.pricingCurrency,
        pricingTotalCents: data.pricingTotalCents,
        notes: data.notes ?? null,
        assignments: [],
        auditLog: [],
        attachments: [],
      };

      if (Array.isArray(data.assignments?.create)) {
        record.assignments = data.assignments.create.map((item: any, index: number) => ({
          id: `assignment_${id}_${index}`,
          providerId: item.provider.connect.id,
          bookingId: id,
          createdAt: now,
          updatedAt: now,
        }));
      }

      const auditCreates = Array.isArray(data.auditLog?.create)
        ? data.auditLog.create
        : data.auditLog?.create
        ? [data.auditLog.create]
        : [];

      auditCreates.forEach((entry: any) => {
        record.auditLog.push({
          id: `audit_${id}_${record.auditLog.length + 1}`,
          createdAt: now,
          actorId: entry.actor?.connect?.id ?? null,
          action: entry.action,
          metadata: entry.metadata,
        });
      });

      this.bookings.set(id, record);
      return this.withInclude(record, include);
    },
    update: async ({ where: { id }, data, include }: any) => {
      const record = this.bookings.get(id);
      if (!record) throw new Error('NOT_FOUND');
      const now = new Date();
      record.updatedAt = now;
      if (data.status) {
        record.status = data.status;
      }
      if (data.assignments?.create) {
        const creates = Array.isArray(data.assignments.create)
          ? data.assignments.create
          : [data.assignments.create];
        creates.forEach((entry: any) => {
          record.assignments.push({
            id: `assignment_${id}_${record.assignments.length + 1}`,
            providerId: entry.provider.connect.id,
            bookingId: id,
            createdAt: now,
            updatedAt: now,
          });
        });
      }
      const auditCreates = Array.isArray(data.auditLog?.create)
        ? data.auditLog.create
        : data.auditLog?.create
        ? [data.auditLog.create]
        : [];

      auditCreates.forEach((entry: any) => {
        record.auditLog.push({
          id: `audit_${id}_${record.auditLog.length + 1}`,
          createdAt: now,
          actorId: entry.actor?.connect?.id ?? null,
          action: entry.action,
          metadata: entry.metadata,
        });
      });
      this.bookings.set(id, record);
      return this.withInclude(record, include);
    },
  };

  private withInclude(record: any, include: any) {
    if (!include) return record;
    const clone = { ...record };
    if (!include.assignments) delete clone.assignments;
    if (!include.auditLog) delete clone.auditLog;
    if (!include.attachments) delete clone.attachments;
    return clone;
  }
}

const createPaymentsServiceMock = () => ({
  initializeBookingPayment: jest.fn().mockResolvedValue(null),
});

describe('BookingsController (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrismaService;
  const bookingNotificationsMock = {
    notifyParticipants: jest.fn().mockResolvedValue(undefined),
    notifyMatchingProgress: jest.fn().mockResolvedValue(undefined),
  };
  const paymentsServiceMock = createPaymentsServiceMock();
  const notificationsServiceMock = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prisma = new InMemoryPrismaService();
    const clientUser: User = {
      id: 'client-1',
      email: 'client@example.com',
      firstName: 'Client',
      lastName: 'User',
      roles: ['client'],
      preferredLocale: 'de',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      companies: [],
    };

    const accessGuardMock = {
      canActivate: (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        request.user = { id: clientUser.id, roles: clientUser.roles };
        request.authUser = clientUser;
        return true;
      },
    };

    const rolesGuardMock = {
      canActivate: () => true,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        BookingsService,
        BookingLocksService,
        BookingMatchingService,
        TeamPlanningService,
        { provide: PrismaService, useValue: prisma },
        { provide: BookingNotificationsService, useValue: bookingNotificationsMock },
        { provide: PaymentsService, useValue: paymentsServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue(accessGuardMock)
      .overrideGuard(RolesGuard)
      .useValue(rolesGuardMock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    bookingNotificationsMock.notifyParticipants.mockClear();
    bookingNotificationsMock.notifyMatchingProgress.mockClear();
  });

  it('creates a booking and allows the owner to cancel it', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        clientId: 'client-1',
        service: 'office',
        surfacesSquareMeters: 120,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        frequency: 'once',
        mode: 'manual',
        ecoPreference: 'standard',
        providerIds: [],
        address: {
          streetLine1: 'Street 1',
          postalCode: '10115',
          city: 'Berlin',
          countryCode: 'DE',
        },
      })
      .expect(201);

    const bookingId = createResponse.body.id;

    const cancelResponse = await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .send({ clientId: 'client-1' })
      .expect(201);

    expect(cancelResponse.body.status).toBe('cancelled');

    expect(bookingNotificationsMock.notifyParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ event: 'created' }),
      })
    );
    expect(bookingNotificationsMock.notifyParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ event: 'cancelled' }),
      })
    );
  });

  it('prevents the client from cancelling once a provider is assigned', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        clientId: 'client-1',
        service: 'office',
        surfacesSquareMeters: 150,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        frequency: 'once',
        mode: 'manual',
        ecoPreference: 'standard',
        providerIds: [],
        address: {
          streetLine1: 'Street 2',
          postalCode: '10115',
          city: 'Berlin',
          countryCode: 'DE',
        },
      })
      .expect(201);

    const bookingId = createResponse.body.id;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignments: {
          create: [{ provider: { connect: { id: 'provider-assigned-1' } } }],
        },
      },
      include: { assignments: true },
    });

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .send({ clientId: 'client-1' })
      .expect(403);
  });
});

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('BookingsController with Prisma seed (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const paymentsServiceMock = createPaymentsServiceMock();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    await prisma.bookingAudit.deleteMany({});
    await prisma.bookingAssignment.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.providerTeamMember.deleteMany({});
    await prisma.providerTeam.deleteMany({});
    await prisma.providerProfile.deleteMany({
      where: { id: { in: ['provider-berlin-1', 'provider-office-2', 'provider-office-4'] } },
    });
    await prisma.company.deleteMany({ where: { id: 'demo-company-berlin' } });

    await seedDemoDatabase(prisma);

    const adminUser: User = {
      id: 'admin-user-1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      roles: ['admin'],
      preferredLocale: 'de',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      companies: [],
    };

    const adminAccessGuard = {
      canActivate: (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        request.user = { id: adminUser.id, roles: adminUser.roles };
        request.authUser = adminUser;
        return true;
      },
    };

    const rolesGuardMock = {
      canActivate: () => true,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        BookingsService,
        BookingLocksService,
        BookingMatchingService,
        TeamPlanningService,
        BookingNotificationsService,
        NotificationsService,
        NotificationEventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentsService, useValue: paymentsServiceMock },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue(adminAccessGuard)
      .overrideGuard(RolesGuard)
      .useValue(rolesGuardMock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('returns provider assignment timeline metadata from seeded booking list', async () => {
    const { body } = await request(app.getHttpServer()).get('/bookings').expect(200);

    const booking = body.find((item: any) => item.id === 'demo-booking-2');
    expect(booking).toBeDefined();
    expect(booking.providerIds).toEqual(
      expect.arrayContaining(['provider-office-2', 'provider-office-4'])
    );

    expect(booking.auditLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'provider_assigned',
          metadata: expect.objectContaining({ providerId: 'provider-office-2' }),
        }),
        expect.objectContaining({
          action: 'provider_removed',
          metadata: expect.objectContaining({ providerId: 'provider-office-3' }),
        }),
      ])
    );
  });

  it('returns cancellation reason metadata for seeded cancelled booking', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/bookings/demo-booking-3')
      .expect(200);

    const cancellationEntry = body.auditLog.find(
      (entry: any) => entry.action === 'status_changed' && entry.metadata?.reason === 'client_cancelled'
    );

    expect(cancellationEntry).toBeDefined();
    expect(cancellationEntry.metadata).toMatchObject({
      from: 'pending_provider',
      to: 'cancelled',
      reason: 'client_cancelled',
    });
  });

  it('returns provider suggestions for a booking query', async () => {
    const providerUser = await prisma.user.create({
      data: {
        email: `provider-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'Provider',
        hashedPassword: 'hashed',
        roles: ['PROVIDER'],
      },
    });

    const providerProfile = await prisma.providerProfile.create({
      data: {
        userId: providerUser.id,
        providerType: ProviderType.FREELANCER,
        languages: ['de', 'en'],
        serviceAreas: ['berlin'],
        serviceCategories: ['office'],
        hourlyRateCents: 4500,
        offersEco: true,
        bio: 'Team spécialisé bureaux.',
      },
    });

    await prisma.providerAvailabilitySlot.createMany({
      data: Array.from({ length: 7 }).map((_, weekday) => ({
        providerId: providerProfile.id,
        weekday,
        startMinutes: 6 * 60,
        endMinutes: 20 * 60,
        timezone: 'Europe/Berlin',
      })),
    });

    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({
      city: 'Berlin',
      service: 'office',
      ecoPreference: 'standard',
      startAt: start,
      endAt: end,
    }).toString();

    try {
      const { body } = await request(app.getHttpServer())
        .get(`/bookings/providers/search?${params}`)
        .expect(200);

      expect(body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: providerProfile.id,
            displayName: 'Test Provider',
            serviceCategories: expect.arrayContaining(['office']),
          }),
        ])
      );
    } finally {
      await prisma.providerAvailabilitySlot.deleteMany({
        where: { providerId: providerProfile.id },
      });
      await prisma.providerProfile.delete({ where: { id: providerProfile.id } });
      await prisma.user.delete({ where: { id: providerUser.id } });
    }
  });
});
