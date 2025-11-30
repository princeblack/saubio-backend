import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  PaymentMethod as PrismaPaymentMethod,
  PaymentStatus as PrismaPaymentStatus,
  PayoutBatchStatus,
  PayoutBatchTrigger,
  Prisma,
  ProviderPayoutStatus,
  Payment as PaymentModel,
  PaymentDistribution as PaymentDistributionModel,
  Document as PrismaDocument,
  Invoice as PrismaInvoice,
  ProviderPayout as PrismaProviderPayout,
  NotificationType,
  UserRole,
  PaymentProvider,
  DisputeStatus as PrismaDisputeStatus,
} from '@prisma/client';
import type {
  User,
  PaymentMandateRecord,
  PaymentMethod as ClientPaymentMethod,
  PaymentRecord,
  ProviderOnboardingResponse,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ProviderProfile as PrismaProviderProfile,
  User as PrismaUser,
  PaymentMandate as PrismaPaymentMandate,
} from '@prisma/client';
import { ProviderOnboardingDto } from './dto/provider-onboarding.dto';
import type { AppEnvironmentConfig } from '../config/configuration';
import { ConfigService } from '@nestjs/config';
import { InvoiceService } from './invoice/invoice.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailQueueService } from '../notifications/email-queue.service';
import { PricingService } from '../pricing/pricing.service';
import { MollieService } from './mollie.service';
import type {
  Mandate as MollieMandate,
  MandateMethod as MollieMandateMethod,
  Locale as MollieLocale,
  SequenceType as MollieSequenceType,
} from '@mollie/api-client';
import { CreateMandateDto } from './dto/create-mandate.dto';

type InitializeBookingPaymentInput = {
  bookingId: string;
  client: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'>;
  amountCents: number;
  currency?: string;
  platformFeeCents?: number;
  description?: string;
};

type CreatePaymentRecordInput = {
  bookingId: string;
  clientId: string;
  amountCents: number;
  currency?: string;
  method?: PrismaPaymentMethod;
  status?: PrismaPaymentStatus;
  platformFeeCents?: number;
  externalCustomerId?: string | null;
  externalPaymentIntentId?: string | null;
  externalPaymentMethodId?: string | null;
  externalSetupIntentId?: string | null;
  externalMandateId?: string | null;
  paymentMethodSnapshot?: Prisma.JsonValue | null;
  billingName?: string | null;
  billingEmail?: string | null;
  externalReference?: string | null;
  occurredAt?: Date;
  provider?: PaymentProvider;
};

type InitializePaymentResult = {
  paymentIntentClientSecret?: string | null;
  setupIntentClientSecret?: string | null;
  checkoutUrl?: string | null;
  provider: PaymentProvider;
};

type PayoutGroup = {
  providerId: string;
  amountCents: number;
  currency: string;
  distributions: PaymentDistributionWithPayment[];
};

type PaymentDistributionWithPayment = PaymentDistributionModel & {
  payment: PaymentModel & {
    booking: {
      id: string;
      service: string;
      startAt: Date;
      endAt: Date;
      addressCity: string;
      pricingTotalCents: number;
    };
    distributions: PaymentDistributionModel[];
  };
};

type PayoutBatchResult = {
  batchId: string;
  providers: number;
  totalAmountCents: number;
};

type ProviderPayoutWithProvider = PrismaProviderPayout & {
  provider: PrismaProviderProfile & { user: PrismaUser };
};

type StoredPayoutMission = {
  bookingId: string;
  paymentId: string;
  paymentDistributionId: string;
  service: string;
  amountCents: number;
  city?: string;
  startAt?: string;
  endAt?: string;
  clientTotalCents?: number;
};

type BillingRecipient = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private adminRecipientsCache: { ids: string[]; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mollieService: MollieService,
    private readonly configService: ConfigService<AppEnvironmentConfig>,
    private readonly invoiceService: InvoiceService,
    private readonly notifications: NotificationsService,
    private readonly emailQueue: EmailQueueService,
    private readonly pricing: PricingService
  ) {}

  @Cron('0 5 * * 5')
  async runWeeklyPayoutJob() {
    try {
      const result = await this.generatePayoutBatch({
        trigger: PayoutBatchTrigger.AUTO,
      });
      if (result) {
        this.logger.log(
          `Weekly payout batch ${result.batchId} created for ${result.providers} providers (total ${(result.totalAmountCents / 100).toFixed(2)}).`
        );
      } else {
        this.logger.log('Weekly payout job: no eligible payouts.');
      }
    } catch (error) {
      this.logger.error('Weekly payout job failed', error instanceof Error ? error.stack : undefined);
    }
  }

  get activePaymentProvider(): 'mollie' | 'none' {
    if (this.mollieService.isEnabled()) {
      return 'mollie';
    }
    return 'none';
  }

  async startProviderOnboardingForUser(user: User): Promise<ProviderOnboardingResponse> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, payoutMethod: true, kycStatus: true },
    });
    if (!profile) {
      throw new NotFoundException('PROVIDER_PROFILE_NOT_FOUND');
    }
    await this.markProviderPayoutReady(profile.id, profile.payoutMethod, profile.kycStatus);
    return this.buildProviderOnboardingResponse();
  }

  async startProviderOnboardingByAdmin(payload: ProviderOnboardingDto): Promise<ProviderOnboardingResponse> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: payload.providerId },
      select: { id: true, payoutMethod: true, kycStatus: true },
    });
    if (!profile) {
      throw new NotFoundException('PROVIDER_PROFILE_NOT_FOUND');
    }
    await this.markProviderPayoutReady(profile.id, profile.payoutMethod, profile.kycStatus);
    return this.buildProviderOnboardingResponse(payload.providerId);
  }

  async createManualPayoutBatch(scheduledFor?: Date, note?: string) {
    return this.generatePayoutBatch({
      trigger: PayoutBatchTrigger.MANUAL,
      scheduledFor: scheduledFor ?? new Date(),
      note,
    });
  }

  private async markProviderPayoutReady(
    providerProfileId: string,
    payoutMethod?: string | null,
    currentKycStatus?: string | null
  ) {
    const updateData: Prisma.ProviderProfileUpdateInput = {
      payoutReady: true,
    };
    if (!payoutMethod) {
      updateData.payoutMethod = 'bank_transfer';
    }
    if (currentKycStatus !== 'verified') {
      updateData.kycStatus = 'verified';
    }
    await this.prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: updateData,
    });
  }

  private buildProviderOnboardingResponse(providerId?: string): ProviderOnboardingResponse {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return {
      url: `${this.getAppBaseUrl()}/prestataire/profile?payout=ready${
        providerId ? `&provider=${providerId}` : ''
      }`,
      expiresAt,
    };
  }

  async listPayoutBatches(limit = 20) {
    const batches = await this.prisma.payoutBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        payouts: {
          include: {
            provider: { include: { user: true } },
            documents: true,
          },
        },
      },
    });

    return batches.map((batch) => ({
      id: batch.id,
      createdAt: batch.createdAt.toISOString(),
      scheduledFor: batch.scheduledFor.toISOString(),
      status: batch.status,
      trigger: batch.trigger,
      note: batch.note ?? undefined,
      payouts: batch.payouts.map((payout) => ({
        id: payout.id,
        providerId: payout.providerId,
        providerName: `${payout.provider.user.firstName ?? ''} ${payout.provider.user.lastName ?? ''}`.trim(),
        amountCents: payout.amountCents,
        currency: payout.currency,
        status: payout.status,
        missions: this.parsePayoutMissions(payout.missions as Prisma.JsonValue),
        statementDocument: this.mapDocumentSummary(
          payout.documents.find((doc) => this.extractDocumentCategory(doc.metadata) === 'payout_statement')
        ),
      })),
    }));
  }

  async listProviderDocuments(user: User) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      return [];
    }

    const documents = await this.prisma.document.findMany({
      where: {
        providerId: profile.id,
        metadata: {
          path: ['category'],
          equals: 'payout_statement',
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return documents.map((doc) => ({
      id: doc.id,
      name: doc.name ?? doc.id,
      url: doc.url,
      createdAt: doc.createdAt.toISOString(),
      category: this.extractDocumentCategory(doc.metadata),
    }));
  }

  async listMandates(user: User): Promise<PaymentMandateRecord[]> {
    const mandates = await this.prisma.paymentMandate.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return mandates.map((mandate) => this.mapMandateToRecord(mandate));
  }

  async createMandate(payload: CreateMandateDto, user: User): Promise<PaymentMandateRecord> {
    if (!this.mollieService.isEnabled()) {
      throw new ConflictException('MOLLIE_NOT_CONFIGURED');
    }
    const customerId = await this.ensureMollieCustomer(user);
    const consumerName = payload.consumerName.trim();
    const consumerAccount = payload.consumerAccount.replace(/\s+/g, '').toUpperCase();
    const signatureDate =
      payload.signatureDate ?? new Date().toISOString().slice(0, 10);

    const mandate = await this.mollieService.createMandate(customerId, {
      method: 'directdebit' as MollieMandateMethod,
      consumerName,
      consumerAccount,
      signatureDate,
    });

    const saved = await this.upsertMollieMandateRecord({
      clientId: user.id,
      mandate,
      customerId,
    });

    return this.mapMandateToRecord(saved);
  }

  async listCustomerPaymentEvents(user: User, limit = 25) {
    const payments = await this.prisma.payment.findMany({
      where: { clientId: user.id },
      select: { id: true },
      take: 200,
    });
    const paymentIds = payments.map((payment) => payment.id);
    if (!paymentIds.length) {
      return [];
    }

    const events = await this.prisma.paymentEvent.findMany({
      where: { paymentId: { in: paymentIds } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return events.map((event) => ({
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      paymentId: event.paymentId ?? undefined,
      provider: event.provider,
      type: event.type,
      payload: event.payload,
    }));
  }

  private mapMandateToRecord(mandate: PrismaPaymentMandate): PaymentMandateRecord {
    return {
      id: mandate.id,
      createdAt: mandate.createdAt.toISOString(),
      updatedAt: mandate.updatedAt.toISOString(),
      provider: this.mapProviderEnumToRecord(mandate.provider),
      externalMandateId: mandate.externalMandateId,
      externalPaymentMethodId: mandate.externalPaymentMethodId ?? undefined,
      method: this.mapPrismaMethodToClient(mandate.method),
      status: mandate.status,
      reference: mandate.reference ?? undefined,
      scheme: mandate.scheme ?? undefined,
      bankCountry: mandate.bankCountry ?? undefined,
      bankCode: mandate.bankCode ?? undefined,
      last4: mandate.last4 ?? undefined,
      fingerprint: mandate.fingerprint ?? undefined,
      url: mandate.url ?? undefined,
      usage: mandate.usage ?? undefined,
      acceptedAt: mandate.acceptedAt?.toISOString() ?? null,
      customerIp: mandate.customerIp ?? undefined,
      customerUserAgent: mandate.customerUserAgent ?? undefined,
      lastSyncedAt: mandate.lastSyncedAt?.toISOString() ?? null,
      revokedAt: mandate.revokedAt?.toISOString() ?? null,
    };
  }

  private async ensureMollieCustomer(user: User): Promise<string> {
    const profile = await this.prisma.clientProfile.findFirst({
      where: { userId: user.id },
      select: { externalCustomerId: true },
    });
    if (profile?.externalCustomerId) {
      return profile.externalCustomerId;
    }
    if (!this.mollieService.isEnabled()) {
      throw new ConflictException('MOLLIE_NOT_CONFIGURED');
    }
    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || undefined;
    const customer = await this.mollieService.createCustomer({
      name,
      email: user.email,
    });
    await this.prisma.clientProfile.updateMany({
      where: { userId: user.id },
      data: { externalCustomerId: customer.id },
    });
    return customer.id;
  }

  async initializeBookingPayment(input: InitializeBookingPaymentInput): Promise<InitializePaymentResult> {
    if (!this.mollieService.isEnabled()) {
      throw new ConflictException('MOLLIE_NOT_CONFIGURED');
    }
    return this.initializeMollieBookingPayment(input);
  }

  async createProviderSignupFeePayment(params: { providerId: string; user: User; amountCents?: number }) {
    if (!this.mollieService.isEnabled()) {
      throw new ConflictException('MOLLIE_NOT_CONFIGURED');
    }
    const amountCents = params.amountCents ?? 25 * 100;
    const amountValue = this.formatAmountValue(amountCents);
    const redirectUrl = `${this.getAppBaseUrl()}/prestataire/onboarding?signupFee=success`;
    const webhookUrl = `${this.getAppBaseUrl()}/api/payments/webhooks/mollie`;

    const payment = await this.mollieService.createPayment({
      amount: { value: amountValue, currency: 'EUR' },
      description: 'Saubio - Frais d’inscription prestataire',
      redirectUrl,
      webhookUrl,
      locale: 'fr_FR' as MollieLocale,
      metadata: {
        purpose: 'provider_signup_fee',
        providerId: params.providerId,
        userId: params.user.id,
        email: params.user.email,
      },
      sequenceType: 'oneoff' as MollieSequenceType,
    });

    return {
      checkoutUrl: payment?._links?.checkout?.href ?? null,
      paymentId: payment.id,
    };
  }

  async adjustShortNoticePayment(params: {
    bookingId: string;
    amountCents: number;
    platformFeeCents: number;
  }) {
    const amount = Math.max(0, Math.floor(params.amountCents));
    if (!amount) {
      return;
    }
    const payment = await this.prisma.payment.findUnique({
      where: { bookingId: params.bookingId },
    });
    if (!payment) {
      this.logger.warn(`No payment record found for booking ${params.bookingId} to adjust.`);
      return;
    }
    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        amountCents: amount,
        platformFeeCents: Math.max(0, Math.floor(params.platformFeeCents)),
      },
    });

    const generatedInvoice = await this.invoiceService.generateClientInvoice({
      bookingId: updatedPayment.bookingId,
      paymentId: updatedPayment.id,
    });
    await this.notifyInvoiceGenerated(
      updatedPayment,
      generatedInvoice?.document ?? null,
      generatedInvoice?.invoice ?? null
    );
  }

  async captureBookingPayment(bookingId: string) {
    this.logger.debug(`captureBookingPayment invoked for booking ${bookingId}, but manual capture is disabled for Mollie.`);
  }

  async captureCheckoutPayment(bookingId: string, user: User) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        clientId: true,
        status: true,
        shortNotice: true,
        shortNoticeDepositCents: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    if (!booking.clientId || booking.clientId !== user.id) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    const updatedPayment = await this.prisma.payment.findFirst({
      where: { bookingId },
    });
    await this.captureBookingPayment(bookingId);
    if (updatedPayment) {
      await this.notifyPaymentConfirmed(updatedPayment, user);
    }
    return { success: true };
  }

  async prepareCheckoutPayment(bookingId: string, user: User) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        assignments: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    if (!booking.clientId || booking.clientId !== user.id) {
      throw new ForbiddenException('BOOKING_FORBIDDEN');
    }

    const requiresPayment =
      booking.assignments.length > 0 ||
      (booking.shortNotice && (booking.shortNoticeDepositCents ?? 0) > 0);

    if (!requiresPayment) {
      return {
        required: false,
        paymentIntentClientSecret: null,
        setupIntentClientSecret: null,
        checkoutUrl: null,
        provider: this.mollieService.isEnabled()
          ? PaymentProvider.MOLLIE
          : PaymentProvider.OTHER,
      };
    }

    const amountCents =
      booking.assignments.length > 0
        ? booking.pricingTotalCents
        : booking.shortNoticeDepositCents ?? booking.pricingTotalCents;

    const paymentSecrets = await this.initializeBookingPayment({
      bookingId: booking.id,
      client: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      amountCents,
      currency: booking.pricingCurrency ?? 'EUR',
      description: `Saubio booking ${booking.service}`,
    });

    return {
      required: true,
      paymentIntentClientSecret: paymentSecrets.paymentIntentClientSecret ?? null,
      setupIntentClientSecret: paymentSecrets.setupIntentClientSecret ?? null,
      checkoutUrl: paymentSecrets.checkoutUrl ?? null,
      provider: paymentSecrets.provider,
    };
  }

  async handleMollieEvent(event: Record<string, unknown>) {
    const resource = typeof event['resource'] === 'string' ? event['resource'].toLowerCase() : undefined;
    const type = (event['type'] as string | undefined) ?? (event['id'] as string | undefined) ?? 'mollie.event';
    const normalizedType = type?.toLowerCase() ?? '';
    const isMandateEvent =
      resource === 'mandate' ||
      normalizedType.includes('mandate') ||
      (typeof event['_embedded'] === 'object' && event['_embedded'] !== null && 'mandate' in (event['_embedded'] as object));

    const metadata = (event['metadata'] as Record<string, unknown> | undefined) ?? {};

    if (isMandateEvent) {
      await this.recordPaymentEvent(PaymentProvider.MOLLIE, type, event);
      await this.handleMollieMandateEvent(event);
      return;
    }

    const paymentId = await this.resolvePaymentIdFromMollie(event);
    await this.recordPaymentEvent(PaymentProvider.MOLLIE, type, event, paymentId ?? undefined);
    this.logger.debug(`Received Mollie webhook ${type}`);

    if (!paymentId) {
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      return;
    }

    const status = this.normalizeMollieStatus(event, type);
    if (!status) {
      return;
    }

    if (
      status === 'paid' &&
      metadata &&
      typeof metadata === 'object' &&
      metadata['purpose'] === 'provider_signup_fee' &&
      typeof metadata['providerId'] === 'string'
    ) {
      await this.prisma.providerProfile.updateMany({
        where: { id: metadata['providerId'] as string },
        data: { signupFeePaidAt: new Date() },
      });
    }

    if (status === 'paid') {
      const now = new Date();
      const method = this.mapMollieMethod(event['method']);
      const updateData: Prisma.PaymentUpdateInput = {
        status: PrismaPaymentStatus.CAPTURED,
        capturedAt: now,
        occurredAt: now,
        ...(method ? { method } : {}),
      };
      if (typeof event['id'] === 'string' && !payment.externalReference) {
        updateData.externalReference = event['id'] as string;
      }
      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: updateData,
      });
      const generatedInvoice = await this.invoiceService.generateClientInvoice({
        bookingId: updatedPayment.bookingId,
        paymentId: updatedPayment.id,
      });
      await this.notifyInvoiceGenerated(
        updatedPayment,
        generatedInvoice?.document ?? null,
        generatedInvoice?.invoice ?? null
      );
      await this.notifyPaymentCapturedEvent(updatedPayment);
      await this.finalizeLoyaltyForPayment(updatedPayment);
    }

    if (status === 'failed') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PrismaPaymentStatus.FAILED,
          occurredAt: new Date(),
        },
      });
    }
  }


  private mapPaymentMethodType(type?: string | null): PrismaPaymentMethod | null {
    switch (type) {
      case 'card':
        return PrismaPaymentMethod.CARD;
      case 'sepa_debit':
        return PrismaPaymentMethod.SEPA;
      case 'paypal':
        return PrismaPaymentMethod.PAYPAL;
      default:
        return null;
    }
  }

  private mapPrismaMethodToClient(method?: PrismaPaymentMethod | null): ClientPaymentMethod | undefined {
    if (!method) {
      return undefined;
    }
    switch (method) {
      case PrismaPaymentMethod.CARD:
        return 'card';
      case PrismaPaymentMethod.SEPA:
        return 'sepa';
      case PrismaPaymentMethod.PAYPAL:
        return 'paypal';
      default:
        return undefined;
    }
  }

  private mapProviderEnumToRecord(provider?: PaymentProvider | null): 'mollie' | 'adyen' | 'other' {
    switch (provider) {
      case PaymentProvider.MOLLIE:
        return 'mollie';
      case PaymentProvider.ADYEN:
        return 'adyen';
      default:
        return 'other';
    }
  }

  private mapMollieMethodToPrisma(method?: string | null): PrismaPaymentMethod | null {
    if (!method) {
      return null;
    }
    switch (method.toLowerCase()) {
      case 'directdebit':
      case 'sepa_debit':
        return PrismaPaymentMethod.SEPA;
      case 'creditcard':
        return PrismaPaymentMethod.CARD;
      default:
        return null;
    }
  }

  private async handleMollieMandateEvent(event: Record<string, unknown>) {
    const customerId = this.extractMollieCustomerId(event);
    const mandateId = typeof event['id'] === 'string' ? event['id'] : undefined;
    if (!customerId || !mandateId) {
      return;
    }
    const profile = await this.prisma.clientProfile.findFirst({
      where: { externalCustomerId: customerId },
      select: { userId: true },
    });
    if (!profile) {
      this.logger.warn(`No client profile found for Mollie customer ${customerId}`);
      return;
    }
    try {
      const mandate = await this.mollieService.getMandate(customerId, mandateId);
      await this.upsertMollieMandateRecord({
        clientId: profile.userId,
        customerId,
        mandate,
      });
    } catch (error) {
      this.logger.warn(
        `Unable to sync Mollie mandate ${mandateId}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  private async generatePayoutBatch(options: {
    trigger: PayoutBatchTrigger;
    scheduledFor?: Date;
    note?: string;
  }): Promise<PayoutBatchResult | null> {
    const distributions = await this.prisma.paymentDistribution.findMany({
      where: {
        beneficiaryType: 'provider',
        payoutStatus: 'pending',
        payment: {
          status: {
            in: [PrismaPaymentStatus.CAPTURED, PrismaPaymentStatus.RELEASED],
          },
        },
      },
      include: {
        payment: {
          include: {
            booking: {
              select: {
                id: true,
                service: true,
                startAt: true,
                endAt: true,
                addressCity: true,
                pricingTotalCents: true,
              },
            },
            distributions: true,
          },
        },
      },
    });

    if (!distributions.length) {
      return null;
    }

    const providerIds = Array.from(new Set(distributions.map((distribution) => distribution.beneficiaryId)));
    const providers = await this.prisma.providerProfile.findMany({
      where: {
        id: { in: providerIds },
        payoutReady: true,
        kycStatus: 'verified',
      },
      select: { id: true },
    });
    const eligibleProviderIds = new Set(providers.map((provider) => provider.id));

    const groups = new Map<string, PayoutGroup>();

    for (const distribution of distributions as PaymentDistributionWithPayment[]) {
      if (!eligibleProviderIds.has(distribution.beneficiaryId)) {
        continue;
      }

      const group = groups.get(distribution.beneficiaryId) ?? {
        providerId: distribution.beneficiaryId,
        amountCents: 0,
        currency: distribution.currency ?? 'EUR',
        distributions: [],
      };

      group.amountCents += distribution.amountCents;
      group.distributions.push(distribution);
      groups.set(distribution.beneficiaryId, group);
    }

    if (groups.size === 0) {
      return null;
    }

    const scheduledFor = options.scheduledFor ?? new Date();

    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.payoutBatch.create({
        data: {
          scheduledFor,
          status: PayoutBatchStatus.PROCESSING,
          trigger: options.trigger,
          note: options.note,
          payouts: {
            create: Array.from(groups.values()).map((group) => ({
              provider: { connect: { id: group.providerId } },
              amountCents: group.amountCents,
              currency: group.currency,
              status: ProviderPayoutStatus.PROCESSING,
              missions: group.distributions.map((item) => ({
                paymentDistributionId: item.id,
                paymentId: item.paymentId,
                bookingId: item.payment.booking.id,
                service: item.payment.booking.service,
                amountCents: item.amountCents,
                city: item.payment.booking.addressCity,
                startAt: item.payment.booking.startAt.toISOString(),
                endAt: item.payment.booking.endAt.toISOString(),
                clientTotalCents: this.computeClientPortionForDistribution(item),
              })),
            })),
          },
        },
        include: {
          payouts: {
            include: {
              provider: {
                include: { user: true },
              },
            },
          },
        },
      });

      await Promise.all(
        createdBatch.payouts.map((payout) => {
          const group = groups.get(payout.providerId);
          if (!group) {
            return Promise.resolve();
          }
          return tx.paymentDistribution.updateMany({
            where: { id: { in: group.distributions.map((item) => item.id) } },
            data: {
              payoutStatus: 'processing',
              providerPayoutId: payout.id,
            },
          });
        })
      );

      return createdBatch;
    });

    const payoutsWithProvider = batch.payouts as ProviderPayoutWithProvider[];
    await Promise.all(
      payoutsWithProvider.map(async (payout) => {
        try {
          const document = await this.invoiceService.generateProviderStatement({ payoutId: payout.id });
          await this.notifyProviderPayoutStatement(payout, document, scheduledFor);
        } catch (error) {
          this.logger.error(
            `Failed to generate provider statement for payout ${payout.id}`,
            error instanceof Error ? error.stack : undefined
          );
        }
      })
    );

    return {
      batchId: batch.id,
      providers: batch.payouts.length,
      totalAmountCents: batch.payouts.reduce((sum, payout) => sum + payout.amountCents, 0),
    };
  }

  private computeClientPortionForDistribution(distribution: PaymentDistributionWithPayment): number {
    const providerShareTotal = distribution.payment.distributions
      .filter((entry) => entry.beneficiaryType === 'provider')
      .reduce((sum, entry) => sum + entry.amountCents, 0);

    const bookingTotal = distribution.payment.booking.pricingTotalCents ?? distribution.payment.amountCents ?? distribution.amountCents;

    if (!providerShareTotal) {
      return bookingTotal;
    }

    const ratio = distribution.amountCents / providerShareTotal;
    return Math.max(0, Math.round(bookingTotal * ratio));
  }

  private parsePayoutMissions(value: Prisma.JsonValue | null): StoredPayoutMission[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((mission) => (typeof mission === 'object' && mission !== null ? (mission as StoredPayoutMission) : null))
      .filter((mission): mission is StoredPayoutMission => Boolean(mission?.bookingId && mission?.paymentDistributionId));
  }

  private extractDocumentCategory(value: Prisma.JsonValue | null): string | undefined {
    if (value && typeof value === 'object') {
      const metadata = value as Record<string, unknown>;
      const category = metadata['category'];
      if (typeof category === 'string') {
        return category;
      }
    }
    return undefined;
  }

  private mapDocumentSummary(
    doc?: {
      id: string;
      name: string | null;
      url: string;
      createdAt: Date;
    }
  ) {
    if (!doc) {
      return undefined;
    }
    return {
      id: doc.id,
      name: doc.name ?? doc.id,
      url: doc.url,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private async notifyInvoiceGenerated(
    payment: PaymentModel,
    document?: PrismaDocument | null,
    invoice?: PrismaInvoice | null
  ) {
    if (!payment.clientId) {
      return;
    }

    const shouldNotify = await this.recordInvoiceAuditEntry(payment, document ?? undefined, invoice ?? undefined);
    if (!shouldNotify) {
      return;
    }

    const bookingRecord = await this.prisma.booking.findUnique({
      where: { id: payment.bookingId },
      select: {
        id: true,
        shortNotice: true,
        service: true,
        startAt: true,
        addressCity: true,
        client: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const payload = {
      event: 'invoice_generated',
      paymentId: payment.id,
      bookingId: payment.bookingId,
      amountCents: payment.amountCents,
      currency: payment.currency ?? 'EUR',
      documentId: document?.id ?? null,
      documentName: document?.name ?? null,
      documentUrl: document?.url ?? null,
      invoiceId: invoice?.id ?? null,
      invoiceNumber: invoice?.invoiceNumber ?? null,
    };

    await this.notifications.emit({
      userIds: [payment.clientId],
      type: NotificationType.BILLING,
      payload,
    });

    const adminRecipients = await this.getAdminRecipients();
    if (adminRecipients.length) {
      await this.notifications.emit({
        userIds: adminRecipients,
        type: NotificationType.BILLING,
        payload: {
          ...payload,
          audience: 'admin',
        },
      });
    }
    const recipient = await this.enqueueInvoiceEmail(
      payment,
      payload,
      document ?? undefined,
      invoice ?? undefined,
      bookingRecord?.client ?? undefined
    );
    if (bookingRecord?.shortNotice && recipient) {
      await this.enqueueShortNoticeConfirmationEmail({
        recipient,
        booking: bookingRecord,
        payload,
        document: document ?? undefined,
        invoice: invoice ?? undefined,
      });
    }
  }

  private async recordInvoiceAuditEntry(
    payment: PaymentModel,
    document?: PrismaDocument,
    invoice?: PrismaInvoice
  ): Promise<boolean> {
    const existingEntry = await this.prisma.bookingAudit.findFirst({
      where: {
        bookingId: payment.bookingId,
        action: 'invoice_generated',
        metadata: {
          path: ['paymentId'],
          equals: payment.id,
        },
      },
    });

    if (existingEntry) {
      return false;
    }

    await this.prisma.bookingAudit.create({
      data: {
        booking: { connect: { id: payment.bookingId } },
        action: 'invoice_generated',
        metadata: {
          paymentId: payment.id,
          invoiceId: invoice?.id ?? null,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          documentId: document?.id ?? null,
        },
      },
    });

    return true;
  }

  private async recordPaymentCapturedAuditEntry(
    payment: PaymentModel & {
      booking?: {
        shortNotice?: boolean | null;
      } | null;
    }
  ): Promise<boolean> {
    const existingEntry = await this.prisma.bookingAudit.findFirst({
      where: {
        bookingId: payment.bookingId,
        action: 'payment_captured',
        metadata: {
          path: ['paymentId'],
          equals: payment.id,
        },
      },
    });

    if (existingEntry) {
      return false;
    }

    await this.prisma.bookingAudit.create({
      data: {
        booking: { connect: { id: payment.bookingId } },
        action: 'payment_captured',
        metadata: {
          paymentId: payment.id,
          amountCents: payment.amountCents,
          currency: payment.currency ?? 'EUR',
          method: payment.method ?? null,
          shortNotice: payment.booking?.shortNotice ?? null,
          capturedAt: (payment.capturedAt ?? payment.occurredAt ?? new Date()).toISOString(),
        },
      },
    });

    return true;
  }

  private async enqueueInvoiceEmail(
    payment: PaymentModel,
    payload: {
      amountCents: number;
      currency: string;
      bookingId: string;
      paymentId: string;
      documentUrl: string | null;
      documentName: string | null;
      invoiceId: string | null;
      invoiceNumber: string | null;
    },
    document?: PrismaDocument,
    invoice?: PrismaInvoice,
    client?: { email: string | null; firstName: string | null; lastName: string | null }
  ): Promise<BillingRecipient | null> {
    const template = 'billing.invoice.generated';
    const recipient = await this.resolveBillingRecipient(payment, client);
    if (!recipient) {
      return null;
    }
    await this.emailQueue.enqueue({
      to: recipient.email,
      template,
      payload: {
        firstName: recipient.firstName ?? recipient.lastName ?? null,
        bookingId: payload.bookingId,
        paymentId: payload.paymentId,
        amountCents: payload.amountCents,
        currency: payload.currency,
        invoiceNumber: invoice?.invoiceNumber ?? payload.invoiceNumber ?? null,
        documentUrl: document?.url ?? payload.documentUrl ?? null,
      },
    });
    return recipient;
  }

  private async resolveBillingRecipient(
    payment: PaymentModel,
    client?: { email: string | null; firstName: string | null; lastName: string | null }
  ): Promise<BillingRecipient | null> {
    if (!payment.clientId) {
      return null;
    }

    if (payment.billingEmail) {
      return {
        email: payment.billingEmail,
        firstName: client?.firstName ?? null,
        lastName: client?.lastName ?? null,
      };
    }

    const fallback =
      client ??
      (await this.prisma.user.findUnique({
        where: { id: payment.clientId },
        select: { email: true, firstName: true, lastName: true },
      }));

    const email = fallback?.email ?? null;
    if (!email) {
      return null;
    }

    return {
      email,
      firstName: fallback?.firstName ?? null,
      lastName: fallback?.lastName ?? null,
    };
  }

  private async enqueueShortNoticeConfirmationEmail(params: {
    recipient: BillingRecipient;
    booking: {
      id: string;
      shortNotice: boolean | null;
      service: string;
      startAt: Date;
      addressCity: string | null;
      client: { firstName: string | null; lastName: string | null; email: string | null } | null;
    };
    payload: {
      amountCents: number;
      currency: string;
    };
    document?: PrismaDocument;
    invoice?: PrismaInvoice;
  }) {
    if (!params.recipient.email) {
      return;
    }
    const clientName =
      params.booking.client?.firstName ??
      params.booking.client?.lastName ??
      params.recipient.firstName ??
      params.recipient.lastName ??
      'Client Saubio';

    await this.emailQueue.enqueue({
      to: params.recipient.email,
      template: 'booking.short_notice.confirmed',
      payload: {
        clientName,
        bookingId: params.booking.id,
        service: params.booking.service,
        city: params.booking.addressCity ?? undefined,
        startAt: params.booking.startAt.toISOString(),
        amountCents: params.payload.amountCents,
        currency: params.payload.currency,
        invoiceNumber: params.invoice?.invoiceNumber ?? null,
        invoiceUrl: params.document?.url ?? null,
      },
    });
  }

  private async finalizeLoyaltyForPayment(payment: PaymentModel) {
    if (!payment.clientId) {
      return;
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: payment.bookingId },
      select: {
        id: true,
        clientId: true,
        pricingLoyaltyCents: true,
        pricingCurrency: true,
      },
    });

    if (!booking || !booking.clientId) {
      return;
    }

    await this.pricing.finalizeBookingLoyalty({
      bookingId: booking.id,
      clientId: booking.clientId,
      paymentId: payment.id,
      loyaltyCreditsCents: booking.pricingLoyaltyCents ?? 0,
      paidAmountCents: payment.amountCents,
      currency: payment.currency ?? booking.pricingCurrency ?? 'EUR',
    });
  }

  private async notifyPaymentConfirmed(
    payment: PaymentModel,
    clientOverride?: { id: string; email: string; firstName?: string | null; lastName?: string | null }
  ) {
    const clientId = payment.clientId ?? clientOverride?.id;
    if (!clientId) {
      return;
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: payment.bookingId },
      select: {
        id: true,
        shortNotice: true,
        addressCity: true,
        service: true,
        client: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    const email = clientOverride?.email ?? booking?.client?.email;
    if (!email) {
      return;
    }

    await this.emailQueue.enqueue({
      to: email,
      template: 'booking.payment.confirmed',
      payload: {
        clientName:
          booking?.client?.firstName ??
          booking?.client?.lastName ??
          clientOverride?.firstName ??
          clientOverride?.lastName ??
          'Client',
        bookingId: booking?.id ?? payment.bookingId,
        amountCents: payment.amountCents,
        currency: payment.currency ?? 'EUR',
      shortNotice: booking?.shortNotice ?? false,
    },
  });
}

  private async notifyPaymentCapturedEvent(payment: PaymentModel) {
    const freshPayment = await this.prisma.payment.findUnique({
      where: { id: payment.id },
      include: {
        booking: {
          select: {
            id: true,
            clientId: true,
            shortNotice: true,
            service: true,
            addressCity: true,
            startAt: true,
          },
        },
      },
    });

    if (!freshPayment) {
      return;
    }

    const recorded = await this.recordPaymentCapturedAuditEntry(freshPayment);
    if (!recorded) {
      return;
    }

    const payload = {
      event: 'payment_captured',
      bookingId: freshPayment.bookingId,
      paymentId: freshPayment.id,
      amountCents: freshPayment.amountCents,
      currency: freshPayment.currency ?? 'EUR',
      method: freshPayment.method ?? null,
      capturedAt: (freshPayment.capturedAt ?? freshPayment.occurredAt ?? new Date()).toISOString(),
      shortNotice: freshPayment.booking?.shortNotice ?? null,
      service: freshPayment.booking?.service ?? null,
      city: freshPayment.booking?.addressCity ?? null,
      startAt: freshPayment.booking?.startAt?.toISOString() ?? null,
    };

    const targetClientId = freshPayment.clientId ?? freshPayment.booking?.clientId ?? null;

    if (targetClientId) {
      await this.notifications.emit({
        userIds: [targetClientId],
        type: NotificationType.BILLING,
        payload,
      });
    }

    const adminRecipients = await this.getAdminRecipients();
    if (adminRecipients.length) {
      await this.notifications.emit({
        userIds: adminRecipients,
        type: NotificationType.BILLING,
        payload: {
          ...payload,
          audience: 'admin',
        },
      });
    }
  }

  private async notifyProviderPayoutStatement(
    payout: ProviderPayoutWithProvider,
    document: PrismaDocument | null,
    scheduledFor: Date
  ) {
    const providerUserId = payout.provider.userId;
    if (!providerUserId) {
      return;
    }

    const payload = {
      event: 'payout_statement_generated',
      payoutId: payout.id,
      batchId: payout.batchId,
      amountCents: payout.amountCents,
      currency: payout.currency,
      scheduledFor: scheduledFor.toISOString(),
      documentId: document?.id ?? null,
      documentName: document?.name ?? null,
      documentUrl: document?.url ?? null,
    };

    await this.notifications.emit({
      userIds: [providerUserId],
      type: NotificationType.BILLING,
      payload,
    });

    const adminRecipients = await this.getAdminRecipients();
    if (adminRecipients.length) {
      await this.notifications.emit({
        userIds: adminRecipients,
        type: NotificationType.BILLING,
        payload: {
          ...payload,
          audience: 'admin',
        },
      });
    }
  }

  private async getAdminRecipients(): Promise<string[]> {
    if (this.adminRecipientsCache && this.adminRecipientsCache.expiresAt > Date.now()) {
      return this.adminRecipientsCache.ids;
    }

    const admins = await this.prisma.user.findMany({
      where: {
        roles: {
          hasSome: [UserRole.ADMIN, UserRole.EMPLOYEE],
        },
        isActive: true,
      },
      select: { id: true },
    });

    const ids = admins.map((user) => user.id);
    this.adminRecipientsCache = {
      ids,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    return ids;
  }

  private async upsertMollieMandateRecord(options: {
    clientId: string;
    customerId: string;
    mandate: MollieMandate;
  }): Promise<PrismaPaymentMandate> {
    const { mandate } = options;
    const details = (mandate.details ?? {}) as Record<string, unknown>;
    const consumerAccount = typeof details['consumerAccount'] === 'string' ? (details['consumerAccount'] as string) : null;
    const consumerBic = typeof details['consumerBic'] === 'string' ? (details['consumerBic'] as string) : null;
    const signatureUrl =
      typeof details['signatureDocumentUrl'] === 'string' ? (details['signatureDocumentUrl'] as string) : null;
    const last4 = consumerAccount ? consumerAccount.slice(-4) : undefined;
    const bankCountry = consumerAccount ? consumerAccount.slice(0, 2) : undefined;
    const acceptedAt = mandate.signatureDate ? new Date(mandate.signatureDate) : null;
    const status = (mandate.status as string | undefined) ?? null;
    const revokedAt =
      status === 'invalid' || status === 'revoked'
        ? new Date()
        : status === 'valid'
        ? null
        : undefined;
    const sequenceType = this.extractMollieSequenceType(mandate);
    const metadata = Object.keys(details).length
      ? (details as unknown as Prisma.JsonValue)
      : undefined;

    return this.prisma.paymentMandate.upsert({
      where: { externalMandateId: mandate.id },
      create: {
        clientId: options.clientId,
        provider: PaymentProvider.MOLLIE,
        externalMandateId: mandate.id,
        method: this.mapMollieMethodToPrisma(mandate.method) ?? PrismaPaymentMethod.SEPA,
        status: status ?? 'pending',
        reference: mandate.mandateReference ?? null,
        scheme: 'sepa_direct_debit',
        bankCountry: bankCountry ?? null,
        bankCode: consumerBic ?? null,
        last4: last4 ?? null,
        fingerprint: null,
        url: signatureUrl ?? null,
        usage: sequenceType ?? null,
        acceptedAt,
        customerIp: null,
        customerUserAgent: null,
        lastSyncedAt: new Date(),
        metadata,
      },
      update: {
        provider: PaymentProvider.MOLLIE,
        method: this.mapMollieMethodToPrisma(mandate.method) ?? undefined,
        status: status ?? undefined,
        reference: mandate.mandateReference ?? undefined,
        bankCountry: bankCountry ?? undefined,
        bankCode: consumerBic ?? undefined,
        last4: last4 ?? undefined,
        url: signatureUrl ?? undefined,
        usage: sequenceType ?? undefined,
        acceptedAt: acceptedAt ?? undefined,
        lastSyncedAt: new Date(),
        revokedAt,
        metadata,
      },
    });
  }

  private async notifySepaStatus(
    payments: PaymentModel[],
    context: {
      event: string;
      status: string;
      severity?: 'info' | 'success' | 'warning' | 'error';
      message: string;
    }
  ) {
    if (!payments.length) {
      return;
    }

    await Promise.all(
      payments.map((payment) =>
        this.notifications.emit({
          type: NotificationType.BILLING,
          userIds: [payment.clientId],
          payload: {
            ...context,
            bookingId: payment.bookingId,
            paymentId: payment.id,
            amountCents: payment.amountCents,
            currency: payment.currency,
            channels: ['email', 'in_app'],
          },
        })
      )
    );

    await this.enqueueSepaEmails(payments, context);
  }

  private async enqueueSepaEmails(
    payments: PaymentModel[],
    context: {
      event: string;
      status: string;
      severity?: 'info' | 'success' | 'warning' | 'error';
      message: string;
    }
  ) {
    const template = this.resolveSepaEmailTemplate(context.event);
    if (!template) {
      return;
    }

    const clientEmailCache = new Map<string, string | null>();

    for (const payment of payments) {
      let email = payment.billingEmail ?? null;
      if (!email) {
        if (!clientEmailCache.has(payment.clientId)) {
          const clientRecord = await this.prisma.user.findUnique({
            where: { id: payment.clientId },
            select: { email: true },
          });
          clientEmailCache.set(payment.clientId, clientRecord?.email ?? null);
        }
        email = clientEmailCache.get(payment.clientId) ?? null;
      }
      if (!email) {
        continue;
      }
      await this.emailQueue.enqueue({
        to: email,
        template,
        payload: {
          ...context,
          bookingId: payment.bookingId,
          paymentId: payment.id,
          amountCents: payment.amountCents,
          currency: payment.currency,
        },
      });
    }
  }

  private resolveSepaEmailTemplate(event: string): string | null {
    switch (event) {
      case 'sepa_payment_succeeded':
        return 'payments.sepa.succeeded';
      case 'sepa_payment_failed':
        return 'payments.sepa.failed';
      case 'sepa_payment_processing':
        return 'payments.sepa.processing';
      default:
        return null;
    }
  }

  private async recordPaymentEvent(
    provider: PaymentProvider,
    type: string,
    payload: unknown,
    paymentId?: string
  ) {
    try {
      const serialized = JSON.parse(JSON.stringify(payload ?? {}));
      await this.prisma.paymentEvent.create({
        data: {
          provider,
          type,
          paymentId: paymentId ?? undefined,
          payload: serialized as Prisma.JsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Unable to persist payment event ${type}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  private async resolvePaymentIdFromMollie(event: Record<string, unknown>): Promise<string | null> {
    const metadata = (event['metadata'] as Record<string, unknown> | undefined) ?? {};
    const bookingId = metadata['bookingId'];
    if (typeof bookingId === 'string') {
      const payment = await this.prisma.payment.findUnique({
        where: { bookingId },
        select: { id: true },
      });
      if (payment) {
        return payment.id;
      }
    }
    const intentId = metadata['paymentIntentId'] ?? event['paymentId'];
    if (typeof intentId === 'string') {
      const payment = await this.prisma.payment.findFirst({
        where: { externalReference: intentId },
        select: { id: true },
      });
      return payment?.id ?? null;
    }
    return null;
  }

  private extractMollieCustomerId(event: Record<string, unknown>): string | null {
    const direct = event['customerId'];
    if (typeof direct === 'string' && direct.length) {
      return direct;
    }
    const links = event['_links'] as Record<string, unknown> | undefined;
    const customerLink =
      (links?.customer as { href?: string } | undefined)?.href ??
      (links?.customer as string | undefined);
    if (typeof customerLink === 'string') {
      const match = customerLink.match(/customers\/([^/?]+)/i);
      if (match?.[1]) {
        return match[1];
      }
    }
    return null;
  }

  private extractMollieSequenceType(mandate: MollieMandate): string | null {
    const sequenceType = (mandate as { sequenceType?: unknown }).sequenceType;
    return typeof sequenceType === 'string' ? sequenceType : null;
  }

  private normalizeMollieStatus(event: Record<string, unknown>, type?: string): 'paid' | 'failed' | null {
    const raw = (event['status'] ?? event['paymentStatus'] ?? event['event']) as string | undefined;
    const normalized = typeof raw === 'string' ? raw.toLowerCase() : '';
    if (['paid', 'authorized', 'completed', 'paidout'].includes(normalized)) {
      return 'paid';
    }
    if (['failed', 'expired', 'canceled', 'cancelled'].includes(normalized)) {
      return 'failed';
    }
    if (type?.includes('.paid')) {
      return 'paid';
    }
    if (type?.includes('.failed') || type?.includes('.expired') || type?.includes('.canceled')) {
      return 'failed';
    }
    return null;
  }

  private mapMollieMethod(method: unknown): PrismaPaymentMethod | undefined {
    if (typeof method !== 'string') {
      return undefined;
    }
    switch (method.toLowerCase()) {
      case 'card':
      case 'creditcard':
        return PrismaPaymentMethod.CARD;
      case 'paypal':
        return PrismaPaymentMethod.PAYPAL;
      case 'banktransfer':
      case 'sepa_credit_transfer':
      case 'sepa_debit':
        return PrismaPaymentMethod.SEPA;
      default:
        return undefined;
    }
  }

  private async upsertPaymentRecord(input: CreatePaymentRecordInput) {
    const existing = await this.prisma.payment.findUnique({
      where: { bookingId: input.bookingId },
    });

    const data: Prisma.PaymentUncheckedCreateInput = {
      bookingId: input.bookingId,
      clientId: input.clientId,
      amountCents: input.amountCents,
      currency: input.currency ?? 'EUR',
      platformFeeCents: input.platformFeeCents ?? 0,
      status: input.status ?? PrismaPaymentStatus.PENDING,
      method: input.method ?? undefined,
      provider: input.provider ?? PaymentProvider.MOLLIE,
      externalCustomerId: input.externalCustomerId ?? undefined,
      externalPaymentIntentId: input.externalPaymentIntentId ?? undefined,
      externalPaymentMethodId: input.externalPaymentMethodId ?? undefined,
      externalSetupIntentId: input.externalSetupIntentId ?? undefined,
      externalMandateId: input.externalMandateId ?? undefined,
      paymentMethodSnapshot:
        input.paymentMethodSnapshot === undefined
          ? undefined
          : input.paymentMethodSnapshot ?? Prisma.JsonNull,
      billingName:
        input.billingName === undefined ? undefined : input.billingName ?? null,
      billingEmail:
        input.billingEmail === undefined ? undefined : input.billingEmail ?? null,
      externalReference: input.externalReference ?? undefined,
      occurredAt: input.occurredAt ?? new Date(),
    };

    if (existing) {
      await this.prisma.payment.update({
        where: { id: existing.id },
        data,
      });
      return existing;
    }

    return this.prisma.payment.create({ data });
  }
  private async initializeMollieBookingPayment(
    input: InitializeBookingPaymentInput
  ): Promise<InitializePaymentResult> {
    if (!this.mollieService.isEnabled()) {
      throw new ConflictException('MOLLIE_NOT_CONFIGURED');
    }
    const externalCustomerId = await this.ensureMollieCustomer(input.client as User);
    const currency = (input.currency ?? 'EUR').toUpperCase();
    const amountValue = this.formatAmountValue(input.amountCents);
    const redirectUrl = `${this.getAppBaseUrl()}/client/bookings/${input.bookingId}?payment=success`;
    const webhookUrl = `${this.getAppBaseUrl()}/api/payments/webhooks/mollie`;
    const description =
      input.description ??
      `Saubio réservation ${input.bookingId.slice(0, 8).toUpperCase()}`;

    const payment = await this.mollieService.createPayment({
      amount: { value: amountValue, currency },
      description,
      redirectUrl,
      webhookUrl,
      locale: 'fr_FR' as MollieLocale,
      customerId: externalCustomerId,
      metadata: {
        bookingId: input.bookingId,
        clientId: input.client.id,
        customerId: externalCustomerId,
      },
      sequenceType: 'oneoff' as MollieSequenceType,
    });

    await this.upsertPaymentRecord({
      bookingId: input.bookingId,
      clientId: input.client.id,
      amountCents: input.amountCents,
      currency,
      platformFeeCents: input.platformFeeCents ?? 0,
      status: PrismaPaymentStatus.PENDING,
      provider: PaymentProvider.MOLLIE,
      externalCustomerId,
      externalReference: payment.id,
      occurredAt: new Date(),
    });

    return {
      checkoutUrl: payment?._links?.checkout?.href ?? null,
      paymentIntentClientSecret: null,
      setupIntentClientSecret: null,
      provider: PaymentProvider.MOLLIE,
    };
  }

  private getAppBaseUrl(): string {
    const url =
      this.configService.get('app.appUrl' as keyof AppEnvironmentConfig) ??
      'http://localhost:3000';
    return url.replace(/\/+$/, '');
  }

  private formatAmountValue(amountCents: number): string {
    const normalized = Math.max(0, Math.round(amountCents));
    return (normalized / 100).toFixed(2);
  }

}
