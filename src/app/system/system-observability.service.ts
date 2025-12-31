import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import type { AppEnvironmentConfig } from '../config/configuration';
import {
  BookingStatus as PrismaBookingStatus,
  EmailQueueStatus as PrismaEmailQueueStatus,
  PaymentStatus as PrismaPaymentStatus,
  Prisma,
  WebhookDeliveryStatus as PrismaWebhookDeliveryStatus,
} from '@prisma/client';
import type {
  AdminPaginatedResponse,
  AdminSystemApiKeyItem,
  AdminSystemExportJobItem,
  AdminSystemHealthCheck,
  AdminSystemHealthResponse,
  AdminSystemImportJobItem,
  AdminSystemInfoResponse,
  AdminSystemIntegrationItem,
  AdminSystemIntegrationsResponse,
  AdminWebhookLogDetail,
  AdminWebhookLogItem,
  WebhookDeliveryStatus,
} from '@saubio/models';
import packageJson from '../../../package.json';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecordWebhookEventInput {
  provider: string;
  rawEventId?: string | null;
  eventType?: string | null;
  resourceId?: string | null;
  headers?: Record<string, unknown> | null;
  payload?: unknown;
  metadata?: Record<string, unknown> | null;
  requestUrl?: string | null;
  signatureValid?: boolean | null;
}

export interface UpdateWebhookEventInput {
  status?: PrismaWebhookDeliveryStatus;
  processedAt?: Date;
  processingLatencyMs?: number | null;
  errorMessage?: string | null;
  metadata?: Prisma.InputJsonValue;
  bookingId?: string | null;
  paymentId?: string | null;
  providerProfileId?: string | null;
  userId?: string | null;
  signatureValid?: boolean | null;
  eventId?: string | null;
  eventType?: string | null;
  resourceId?: string | null;
  payload?: Prisma.InputJsonValue;
}

export interface WebhookLogListParams {
  page?: number;
  pageSize?: number;
  provider?: string;
  status?: PrismaWebhookDeliveryStatus;
  eventType?: string;
  resourceId?: string;
  bookingId?: string;
  paymentId?: string;
  providerProfileId?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface SystemApiKeysListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

export interface DataImportJobsListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  entity?: string;
  search?: string;
}

export interface DataExportJobsListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
  search?: string;
}

type WebhookLogWithRelations = Prisma.WebhookEventLogGetPayload<{
  include: {
    booking: { select: { id: true; service: true; addressCity: true; addressPostalCode: true } };
    payment: { select: { id: true; status: true; amountCents: true; currency: true } };
    providerProfile: {
      select: { id: true; user: { select: { firstName: true; lastName: true } } };
    };
    user: { select: { id: true; email: true; firstName: true; lastName: true } };
  };
}>;

@Injectable()
export class SystemObservabilityService {
  private readonly logger = new Logger(SystemObservabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnvironmentConfig, true>
  ) {}

  async recordWebhookEvent(input: RecordWebhookEventInput) {
    return this.prisma.webhookEventLog.create({
      data: {
        provider: input.provider,
        eventId: input.rawEventId ?? null,
        eventType: input.eventType ?? null,
        resourceId: input.resourceId ?? null,
        headers: input.headers ? (input.headers as Prisma.InputJsonValue) : undefined,
        payload: input.payload as Prisma.InputJsonValue | undefined,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        requestUrl: input.requestUrl ?? null,
        signatureValid: input.signatureValid ?? null,
      },
    });
  }

  async updateWebhookEvent(id: string, input: UpdateWebhookEventInput) {
    try {
      await this.prisma.webhookEventLog.update({
        where: { id },
        data: {
          status: input.status,
          processedAt: input.processedAt,
          processingLatencyMs: input.processingLatencyMs ?? undefined,
          errorMessage: input.errorMessage,
          metadata: input.metadata,
          bookingId: input.bookingId ?? undefined,
          paymentId: input.paymentId ?? undefined,
          providerProfileId: input.providerProfileId ?? undefined,
          userId: input.userId ?? undefined,
          signatureValid: input.signatureValid ?? undefined,
          eventId: input.eventId ?? undefined,
          eventType: input.eventType ?? undefined,
          resourceId: input.resourceId ?? undefined,
          payload: input.payload ?? undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `[Observability] Unable to update webhook log ${id}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  async listWebhookEvents(params: WebhookLogListParams = {}): Promise<AdminPaginatedResponse<AdminWebhookLogItem>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(Number(params.pageSize ?? 25), 200));
    const where: Prisma.WebhookEventLogWhereInput = {};

    if (params.provider) {
      where.provider = { contains: params.provider, mode: 'insensitive' };
    }
    if (params.status) {
      where.status = params.status;
    }
    if (params.eventType) {
      where.eventType = { contains: params.eventType, mode: 'insensitive' };
    }
    if (params.resourceId) {
      where.resourceId = { contains: params.resourceId, mode: 'insensitive' };
    }
    if (params.bookingId) {
      where.bookingId = params.bookingId;
    }
    if (params.paymentId) {
      where.paymentId = params.paymentId;
    }
    if (params.providerProfileId) {
      where.providerProfileId = params.providerProfileId;
    }
    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.search) {
      where.OR = [
        { eventId: { contains: params.search, mode: 'insensitive' } },
        { eventType: { contains: params.search, mode: 'insensitive' } },
        { resourceId: { contains: params.search, mode: 'insensitive' } },
        { errorMessage: { contains: params.search, mode: 'insensitive' } },
        { provider: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.from || params.to) {
      where.receivedAt = {};
      if (params.from) {
        where.receivedAt.gte = new Date(params.from);
      }
      if (params.to) {
        where.receivedAt.lte = new Date(params.to);
      }
    }

    const [total, records] = await this.prisma.$transaction([
      this.prisma.webhookEventLog.count({ where }),
      this.prisma.webhookEventLog.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          booking: { select: { id: true, service: true, addressCity: true, addressPostalCode: true } },
          payment: { select: { id: true, status: true, amountCents: true, currency: true } },
          providerProfile: {
            select: { id: true, user: { select: { firstName: true, lastName: true } } },
          },
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: records.map((record) => this.mapWebhookLog(record)),
    };
  }

  async getWebhookEvent(id: string): Promise<AdminWebhookLogDetail> {
    const record = await this.prisma.webhookEventLog.findUnique({
      where: { id },
      include: {
        booking: { select: { id: true, service: true, addressCity: true, addressPostalCode: true } },
        payment: { select: { id: true, status: true, amountCents: true, currency: true } },
        providerProfile: {
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!record) {
      throw new Error('WEBHOOK_LOG_NOT_FOUND');
    }
    const base = this.mapWebhookLog(record);
    return {
      ...base,
      headers: this.asRecord(record.headers),
      payload: record.payload ?? undefined,
      metadata: this.asRecord(record.metadata),
    };
  }

  async getHealthOverview(): Promise<AdminSystemHealthResponse> {
    const now = new Date();
    const window24h = this.subtractHours(now, 24);
    const window2h = this.subtractHours(now, 2);
    const window1h = this.subtractHours(now, 1);
    const dbStart = performance.now();
    let dbLatency: number | null = null;
    let dbStatus: 'ok' | 'degraded' | 'down' = 'ok';

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      dbLatency = Math.round(performance.now() - dbStart);
      if (dbLatency > 400) {
        dbStatus = 'degraded';
      }
    } catch (error) {
      dbStatus = 'down';
      this.logger.error(`[Observability] Database ping failed: ${error instanceof Error ? error.message : error}`);
    }

    const [
      pendingEmails,
      stuckBookings,
      paymentsLast24h,
      failedPayments24h,
      totalWebhooks24h,
      failedWebhooks1h,
      lastWebhook,
    ] = await Promise.all([
      this.prisma.emailQueue.count({ where: { status: PrismaEmailQueueStatus.PENDING } }),
      this.prisma.booking.count({
        where: {
          status: PrismaBookingStatus.PENDING_PROVIDER,
          createdAt: { lt: window2h },
        },
      }),
      this.prisma.payment.count({ where: { createdAt: { gte: window24h } } }),
      this.prisma.payment.count({
        where: { createdAt: { gte: window24h }, status: PrismaPaymentStatus.FAILED },
      }),
      this.prisma.webhookEventLog.count({ where: { receivedAt: { gte: window24h } } }),
      this.prisma.webhookEventLog.count({
        where: { receivedAt: { gte: window1h }, status: PrismaWebhookDeliveryStatus.FAILED },
      }),
      this.prisma.webhookEventLog.findFirst({ orderBy: { receivedAt: 'desc' } }),
    ]);

    const queueStatus: 'ok' | 'degraded' | 'down' =
      pendingEmails > 500 ? 'down' : pendingEmails > 120 ? 'degraded' : 'ok';
    const matchingStatus: 'ok' | 'degraded' | 'down' =
      stuckBookings > 50 ? 'down' : stuckBookings > 10 ? 'degraded' : 'ok';
    const paymentStatus: 'ok' | 'degraded' =
      paymentsLast24h > 0 && failedPayments24h / Math.max(paymentsLast24h, 1) > 0.1 ? 'degraded' : 'ok';
    const webhookStatus: 'ok' | 'degraded' =
      failedWebhooks1h > 0 ? 'degraded' : 'ok';

    const checks: AdminSystemHealthCheck[] = [
      {
        id: 'api',
        label: 'API Backend',
        status: 'ok',
        message: 'Serveur opérationnel',
        lastCheckedAt: now.toISOString(),
        metrics: {
          uptimeSeconds: Math.round(process.uptime()),
        },
      },
      {
        id: 'database',
        label: 'Base de données',
        status: dbStatus,
        latencyMs: dbLatency ?? undefined,
        lastCheckedAt: now.toISOString(),
      },
      {
        id: 'queues',
        label: 'Queues & emails',
        status: queueStatus,
        message: `${pendingEmails} emails en attente`,
        metrics: { pendingEmails },
      },
      {
        id: 'matching',
        label: 'Matching & Dispatch',
        status: matchingStatus,
        message: stuckBookings > 0 ? `${stuckBookings} missions à relancer` : 'Rien à signaler',
        metrics: { backlog: stuckBookings },
      },
      {
        id: 'payments',
        label: 'Paiements Mollie',
        status: paymentStatus,
        message:
          failedPayments24h > 0
            ? `${failedPayments24h} paiements échoués / 24h`
            : `${paymentsLast24h} paiements sur 24h`,
        metrics: {
          payments24h: paymentsLast24h,
          failed24h: failedPayments24h,
        },
      },
      {
        id: 'webhooks',
        label: 'Webhooks',
        status: webhookStatus,
        message:
          failedWebhooks1h > 0
            ? `${failedWebhooks1h} erreurs dernière heure`
            : `${totalWebhooks24h} événements reçus / 24h`,
        lastCheckedAt: lastWebhook?.receivedAt?.toISOString(),
        metrics: {
          total24h: totalWebhooks24h,
          failed1h: failedWebhooks1h,
        },
      },
    ];

    const globalStatus = this.computeGlobalStatus(checks);
    return {
      status: globalStatus,
      updatedAt: now.toISOString(),
      checks,
    };
  }

  async getIntegrationsOverview(): Promise<AdminSystemIntegrationsResponse> {
    const now = new Date();
    const window24h = this.subtractHours(now, 24);
    const config =
      this.configService.get<AppEnvironmentConfig>('app' as keyof AppEnvironmentConfig) ?? ({} as AppEnvironmentConfig);

    const [
      lastPaymentEvent,
      lastEmailSent,
      failedEmails24h,
      lastDocument,
      recentOnfido,
      payments24h,
      failedPayments24h,
      lastWebhook,
    ] = await Promise.all([
      this.prisma.paymentEvent.findFirst({ orderBy: { createdAt: 'desc' } }),
      this.prisma.emailQueue.findFirst({
        where: { status: PrismaEmailQueueStatus.SENT },
        orderBy: { sentAt: 'desc' },
      }),
      this.prisma.emailQueue.count({
        where: {
          status: PrismaEmailQueueStatus.FAILED,
          updatedAt: { gte: window24h },
        },
      }),
      this.prisma.document.findFirst({ orderBy: { createdAt: 'desc' } }),
      this.prisma.providerProfile.findFirst({
        where: { onfidoWorkflowRunId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true, identityVerificationStatus: true },
      }),
      this.prisma.payment.count({ where: { createdAt: { gte: window24h } } }),
      this.prisma.payment.count({
        where: { createdAt: { gte: window24h }, status: PrismaPaymentStatus.FAILED },
      }),
      this.prisma.webhookEventLog.findFirst({ orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
    ]);

    const integrations: AdminSystemIntegrationItem[] = [];
    const mollieMode = config.mollieApiKey?.startsWith('test_') ? 'test' : 'live';
    integrations.push({
      id: 'mollie',
      name: 'Mollie Payments',
      category: 'Paiement',
      status: config.mollieApiKey ? (failedPayments24h > 0 ? 'warning' : 'active') : 'inactive',
      lastActivityAt: lastPaymentEvent?.createdAt?.toISOString(),
      details: [
        { label: 'Mode', value: config.mollieApiKey ? mollieMode.toUpperCase() : '—' },
        { label: 'Paiements 24h', value: String(payments24h) },
        { label: 'Échecs 24h', value: String(failedPayments24h) },
        { label: 'Webhook URL', value: this.maskUrl(config.paymentsWebhookUrl) ?? '—', muted: true },
      ],
      links: config.paymentsWebhookUrl ? [{ label: 'Webhook', url: config.paymentsWebhookUrl }] : undefined,
    });

    integrations.push({
      id: 'smtp',
      name: 'SMTP Email',
      category: 'Communication',
      status: config.smtpHost || config.emailProviderUrl ? (failedEmails24h > 0 ? 'warning' : 'active') : 'inactive',
      lastActivityAt: lastEmailSent?.sentAt?.toISOString(),
      details: [
        { label: 'Host', value: config.smtpHost ?? config.emailProviderUrl ?? '—' },
        { label: 'Dernier envoi', value: lastEmailSent?.template ?? '—', muted: true },
        { label: 'Échecs 24h', value: String(failedEmails24h) },
      ],
    });

    integrations.push({
      id: 'storage',
      name: 'Stockage documents',
      category: 'Fichiers',
      status: lastDocument ? 'active' : 'warning',
      lastActivityAt: lastDocument?.createdAt?.toISOString(),
      details: [
        { label: 'Dernier document', value: lastDocument?.type ?? '—' },
      ],
    });

    integrations.push({
      id: 'onfido',
      name: 'Onfido KYC',
      category: 'Vérification',
      status: config.onfidoApiToken ? 'active' : 'inactive',
      lastActivityAt: recentOnfido?.updatedAt?.toISOString(),
      details: [
        { label: 'Dernier workflow', value: recentOnfido?.identityVerificationStatus ?? '—' },
      ],
    });

    integrations.push({
      id: 'webhooks',
      name: 'Webhooks entrants',
      category: 'Observabilité',
      status: lastWebhook ? 'active' : 'warning',
      lastActivityAt: lastWebhook?.receivedAt?.toISOString(),
      details: [
        { label: 'Dernier événement', value: lastWebhook?.receivedAt?.toISOString() ?? '—' },
      ],
    });

    return { integrations };
  }

  async getSystemInfo(): Promise<AdminSystemInfoResponse> {
    const config =
      this.configService.get<AppEnvironmentConfig>('app' as keyof AppEnvironmentConfig) ?? ({} as AppEnvironmentConfig);
    const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? process.env.COMMIT_SHA;
    const buildTimestamp = process.env.BUILD_TIME ?? process.env.BUILD_TIMESTAMP;
    const frontendVersion = process.env.NEXT_PUBLIC_APP_VERSION;
    const featureFlags = [
      {
        key: 'swagger',
        label: 'Swagger UI',
        enabled: Boolean(config.enableSwagger),
      },
      {
        key: 'mollie',
        label: 'Mollie Payments',
        enabled: Boolean(config.mollieApiKey),
      },
      {
        key: 'smtp',
        label: 'SMTP/Email provider',
        enabled: Boolean(config.smtpHost || config.emailProviderUrl),
      },
      {
        key: 'twilio',
        label: 'Twilio SMS',
        enabled: Boolean(config.twilioAccountSid && config.twilioAuthToken),
      },
    ];

    return {
      environment: {
        nodeEnv: config.nodeEnv,
        apiUrl: config.apiPublicUrl ?? config.appUrl ?? '',
        appUrl: config.appUrl ?? '',
      },
      versions: {
        backend: packageJson.version,
        frontend: frontendVersion ?? undefined,
        commitSha: commitSha ?? undefined,
        buildDate: buildTimestamp ?? undefined,
      },
      featureFlags,
    };
  }

  async listApiKeys(params: SystemApiKeysListParams = {}): Promise<AdminPaginatedResponse<AdminSystemApiKeyItem>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(Number(params.pageSize ?? 20), 100));
    const client: any = this.prisma as any;

    if (!client.systemApiKey) {
      return this.emptyPaginatedResponse(page, pageSize);
    }

    const where: Record<string, unknown> = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { prefix: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    try {
      const [total, records] = await this.prisma.$transaction([
        client.systemApiKey.count({ where }),
        client.systemApiKey.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            owner: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        }),
      ]);

      return {
        page,
        pageSize,
        total,
        items: records.map((record: any) => this.mapSystemApiKey(record)),
      };
    } catch (error) {
      this.logger.warn(`[Observability] Unable to list API keys: ${this.stringifyError(error)}`);
      return this.emptyPaginatedResponse(page, pageSize);
    }
  }

  async listImportJobs(
    params: DataImportJobsListParams = {}
  ): Promise<AdminPaginatedResponse<AdminSystemImportJobItem>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(Number(params.pageSize ?? 20), 100));
    const client: any = this.prisma as any;

    if (!client.dataImportJob) {
      return this.emptyPaginatedResponse(page, pageSize);
    }

    const where: Record<string, unknown> = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.entity) {
      where.entity = params.entity;
    }
    if (params.search) {
      where.OR = [
        { label: { contains: params.search, mode: 'insensitive' } },
        { sourceFilename: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    try {
      const [total, records] = await this.prisma.$transaction([
        client.dataImportJob.count({ where }),
        client.dataImportJob.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        }),
      ]);

      return {
        page,
        pageSize,
        total,
        items: records.map((record: any) => this.mapImportJob(record)),
      };
    } catch (error) {
      this.logger.warn(`[Observability] Unable to list import jobs: ${this.stringifyError(error)}`);
      return this.emptyPaginatedResponse(page, pageSize);
    }
  }

  async listExportJobs(
    params: DataExportJobsListParams = {}
  ): Promise<AdminPaginatedResponse<AdminSystemExportJobItem>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(Number(params.pageSize ?? 20), 100));
    const client: any = this.prisma as any;

    if (!client.dataExportJob) {
      return this.emptyPaginatedResponse(page, pageSize);
    }

    const where: Record<string, unknown> = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.type) {
      where.type = params.type;
    }
    if (params.search) {
      where.OR = [
        { label: { contains: params.search, mode: 'insensitive' } },
        { fileUrl: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    try {
      const [total, records] = await this.prisma.$transaction([
        client.dataExportJob.count({ where }),
        client.dataExportJob.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        }),
      ]);

      return {
        page,
        pageSize,
        total,
        items: records.map((record: any) => this.mapExportJob(record)),
      };
    } catch (error) {
      this.logger.warn(`[Observability] Unable to list export jobs: ${this.stringifyError(error)}`);
      return this.emptyPaginatedResponse(page, pageSize);
    }
  }

  private mapWebhookLog(record: WebhookLogWithRelations): AdminWebhookLogItem {
    const status = record.status.toLowerCase() as WebhookDeliveryStatus;
    return {
      id: record.id,
      provider: record.provider,
      status,
      eventId: record.eventId ?? undefined,
      eventType: record.eventType ?? undefined,
      resourceId: record.resourceId ?? undefined,
      receivedAt: record.receivedAt.toISOString(),
      processedAt: record.processedAt?.toISOString(),
      latencyMs: record.processingLatencyMs ?? undefined,
      errorMessage: record.errorMessage ?? undefined,
      booking: record.booking
        ? {
            id: record.booking.id,
            service: record.booking.service,
            city: record.booking.addressCity ?? undefined,
            postalCode: record.booking.addressPostalCode ?? undefined,
          }
        : undefined,
      payment: record.payment
        ? {
            id: record.payment.id,
            status: record.payment.status.toLowerCase() as AdminWebhookLogItem['payment']['status'],
            amountCents: record.payment.amountCents,
            currency: record.payment.currency,
          }
        : undefined,
      providerProfile:
        record.providerProfile && record.providerProfile.user
          ? {
              id: record.providerProfile.id,
              name: `${record.providerProfile.user.firstName ?? ''} ${record.providerProfile.user.lastName ?? ''}`.trim(),
            }
          : undefined,
      user: record.user
        ? {
            id: record.user.id,
            name: `${record.user.firstName ?? ''} ${record.user.lastName ?? ''}`.trim(),
            email: record.user.email ?? undefined,
          }
        : undefined,
    };
  }

  private computeGlobalStatus(checks: AdminSystemHealthCheck[]): 'ok' | 'degraded' | 'down' {
    if (checks.some((check) => check.status === 'down')) {
      return 'down';
    }
    if (checks.some((check) => check.status === 'degraded')) {
      return 'degraded';
    }
    return 'ok';
  }

  private subtractHours(date: Date, hours: number) {
    return new Date(date.getTime() - hours * 60 * 60 * 1000);
  }

  private maskUrl(url?: string | null) {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      parsed.search = '';
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return undefined;
  }

  private emptyPaginatedResponse<T>(page: number, pageSize: number): AdminPaginatedResponse<T> {
    return { page, pageSize, total: 0, items: [] };
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return typeof error === 'string' ? error : JSON.stringify(error);
  }

  private toIso(value?: Date | null): string | undefined {
    return value ? value.toISOString() : undefined;
  }

  private mapSystemApiKey(record: any): AdminSystemApiKeyItem {
    return {
      id: record.id,
      name: record.name,
      description: record.description ?? undefined,
      prefix: record.prefix,
      scopes: Array.isArray(record.scopes) ? record.scopes : [],
      status: this.toApiKeyStatus(record.status),
      rateLimitPerDay: record.rateLimitPerDay ?? undefined,
      lastUsedAt: this.toIso(record.lastUsedAt),
      createdAt: this.toIso(record.createdAt)!,
      updatedAt: this.toIso(record.updatedAt)!,
      owner: this.mapUser(record.owner),
    };
  }

  private mapImportJob(record: any): AdminSystemImportJobItem {
    return {
      id: record.id,
      label: record.label,
      entity: this.toImportEntity(record.entity),
      format: this.toJobFormat(record.format),
      status: this.toJobStatus(record.status),
      processedCount: record.processedCount ?? 0,
      totalCount: record.totalCount ?? undefined,
      sourceFilename: record.sourceFilename ?? undefined,
      createdAt: this.toIso(record.createdAt)!,
      startedAt: this.toIso(record.startedAt),
      completedAt: this.toIso(record.completedAt),
      updatedAt: this.toIso(record.updatedAt)!,
      errorMessage: record.errorMessage ?? undefined,
      metadata: this.asRecord(record.metadata) ?? undefined,
      createdBy: this.mapUser(record.createdBy),
    };
  }

  private mapExportJob(record: any): AdminSystemExportJobItem {
    return {
      id: record.id,
      label: record.label,
      type: this.toExportType(record.type),
      format: this.toJobFormat(record.format),
      status: this.toJobStatus(record.status),
      recordCount: record.recordCount ?? undefined,
      fileUrl: record.fileUrl ?? undefined,
      expiresAt: this.toIso(record.expiresAt),
      createdAt: this.toIso(record.createdAt)!,
      completedAt: this.toIso(record.completedAt),
      updatedAt: this.toIso(record.updatedAt)!,
      errorMessage: record.errorMessage ?? undefined,
      metadata: this.asRecord(record.parameters) ?? undefined,
      requestedBy: this.mapUser(record.requestedBy),
    };
  }

  private mapUser(user?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }) {
    if (!user) {
      return undefined;
    }
    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return {
      id: user.id,
      name: name || user.email || undefined,
      email: user.email ?? undefined,
    };
  }

  private toApiKeyStatus(value?: string): AdminSystemApiKeyItem['status'] {
    switch ((value ?? '').toLowerCase()) {
      case 'paused':
        return 'paused';
      case 'revoked':
        return 'revoked';
      default:
        return 'active';
    }
  }

  private toJobStatus(value?: string): AdminSystemImportJobItem['status'] {
    switch ((value ?? '').toLowerCase()) {
      case 'processing':
        return 'processing';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private toJobFormat(value?: string): AdminSystemImportJobItem['format'] {
    return (value ?? 'csv').toLowerCase() === 'json' ? 'json' : 'csv';
  }

  private toImportEntity(value?: string): AdminSystemImportJobItem['entity'] {
    const normalized = (value ?? '').toLowerCase();
    if (['providers', 'bookings', 'payments', 'zones', 'services', 'users'].includes(normalized)) {
      return normalized as AdminSystemImportJobItem['entity'];
    }
    return 'other';
  }

  private toExportType(value?: string): AdminSystemExportJobItem['type'] {
    const normalized = (value ?? '').toLowerCase();
    if (['bookings', 'payments', 'providers', 'clients', 'disputes', 'finance'].includes(normalized)) {
      return normalized as AdminSystemExportJobItem['type'];
    }
    return 'other';
  }
}
