import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { ExecutionContext } from '@nestjs/common';
import type { User } from '@saubio/models';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { seedDemoDatabase } from '@saubio/prisma/seed';
import { AdminDashboardController } from './dashboard.controller';
import { AdminDashboardService } from './dashboard.service';
import { ProviderController } from '../provider/provider.controller';
import { ProviderService } from '../provider/provider.service';
import { BookingNotificationsService } from '../bookings/booking-notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { SmsService } from '../provider/sms.service';
import { ConfigService } from '@nestjs/config';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Dashboard APIs (e2e)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await seedDemoDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /admin/dashboard', () => {
    let app: INestApplication;
    let adminUser: User;

    beforeAll(async () => {
      const record = await prisma.user.findFirstOrThrow({
        where: { email: 'admin@mahamadicongo.com' },
      });
      adminUser = {
        id: record.id,
        email: record.email,
        firstName: record.firstName,
        lastName: record.lastName,
        roles: record.roles.map((role) => role.toLowerCase()) as User['roles'],
        preferredLocale: record.preferredLocale,
        isActive: record.isActive,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        companies: [],
      };

      const accessGuardMock = {
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: adminUser.id, roles: adminUser.roles };
          req.authUser = adminUser;
          return true;
        },
      };

      const moduleRef = await Test.createTestingModule({
        controllers: [AdminDashboardController],
        providers: [AdminDashboardService, PrismaService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideGuard(AccessTokenGuard)
        .useValue(accessGuardMock)
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns dashboard metrics with expected shape', async () => {
      const response = await request(app.getHttpServer()).get('/admin/dashboard').expect(200);
      const body = response.body;

      expect(body).toMatchObject({
        metrics: {
          activeProviders: expect.any(Number),
          pendingBookings: expect.any(Number),
          satisfaction: expect.any(Number),
          revenue: expect.any(Number),
        },
        performance: {
          matching: expect.any(Number),
          onTime: expect.any(Number),
          supportSlaHours: expect.any(Number),
        },
      });

      expect(Array.isArray(body.alerts)).toBe(true);
      if (body.alerts.length > 0) {
        expect(body.alerts[0]).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            label: expect.any(String),
            description: expect.any(String),
          }),
        );
      }

      expect(Array.isArray(body.topProviders)).toBe(true);
      if (body.topProviders.length > 0) {
        expect(body.topProviders[0]).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            rating: expect.any(Number),
            missions: expect.any(Number),
          }),
        );
      }
    });
  });

  describe('GET /provider/dashboard', () => {
    let app: INestApplication;
    let providerUser: User;

    beforeAll(async () => {
      const record = await prisma.user.findFirstOrThrow({
        where: { email: 'provider.berlin@example.com' },
      });
      providerUser = {
        id: record.id,
        email: record.email,
        firstName: record.firstName,
        lastName: record.lastName,
        roles: record.roles.map((role) => role.toLowerCase()) as User['roles'],
        preferredLocale: record.preferredLocale,
        isActive: record.isActive,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        companies: [],
      };

      const accessGuardMock = {
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: providerUser.id, roles: providerUser.roles };
          req.authUser = providerUser;
          return true;
        },
      };

      const moduleRef = await Test.createTestingModule({
        controllers: [ProviderController],
        providers: [ProviderService, PrismaService, BookingNotificationsService, PaymentsService, SmsService, ConfigService],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(BookingNotificationsService)
        .useValue({ notifyParticipants: () => Promise.resolve() })
        .overrideProvider(PaymentsService)
        .useValue({ initializeBookingPayment: () => Promise.resolve(null) })
        .overrideProvider(SmsService)
        .useValue({ send: () => Promise.resolve() })
        .overrideProvider(ConfigService)
        .useValue({ get: () => null })
        .overrideGuard(AccessTokenGuard)
        .useValue(accessGuardMock)
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns provider dashboard data with expected aggregates', async () => {
      const response = await request(app.getHttpServer()).get('/provider/dashboard').expect(200);
      const body = response.body;

      expect(body).toMatchObject({
        metrics: {
          completed: expect.any(Number),
          revenueCents: expect.any(Number),
          rating: expect.any(Number),
          ecoRate: expect.any(Number),
        },
        quality: {
          rating: expect.any(Number),
          incidents: expect.any(Number),
          ecoRate: expect.any(Number),
          responseMinutes: expect.any(Number),
        },
        payments: {
          totalCents: expect.any(Number),
          pendingCents: expect.any(Number),
        },
      });

      expect(Array.isArray(body.upcoming)).toBe(true);
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(Array.isArray(body.resources)).toBe(true);
    });
  });
});
