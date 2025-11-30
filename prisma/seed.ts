import {
  BookingMode,
  BookingStatus,
  CleaningFrequency,
  EcoPreference,
  PrismaClient,
  ProviderType,
  UserRole,
  SupportPriority,
  SupportStatus,
  SupportCategory,
  NotificationType,
  NotificationChannel,
  DigestFrequency,
  PricingRuleType,
  PricingRuleAudience,
  LoyaltyTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

type UserIdResolver = (id: string) => string;

async function upsertUsers(prisma: PrismaClient) {
  const userIdMap = new Map<string, string>();
  const users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: UserRole[];
    preferredLocale: string;
    password?: string;
    preferences?: {
      marketingEmails?: boolean;
      productUpdates?: boolean;
      enableDarkMode?: boolean;
      digestFrequency?: DigestFrequency;
    };
  }> = [
    {
      id: 'demo-client-1',
      email: 'lena.schmidt@example.com',
      firstName: 'Lena',
      lastName: 'Schmidt',
      roles: [UserRole.CLIENT],
      preferredLocale: 'de',
      preferences: {
        marketingEmails: true,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'demo-client-2',
      email: 'marc.weber@example.com',
      firstName: 'Marc',
      lastName: 'Weber',
      roles: [UserRole.CLIENT],
      preferredLocale: 'de',
      preferences: {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.NEVER,
      },
    },
    {
      id: 'demo-client-3',
      email: 'amira.benali@example.com',
      firstName: 'Amira',
      lastName: 'Benali',
      roles: [UserRole.CLIENT],
      preferredLocale: 'de',
      preferences: {
        marketingEmails: true,
        productUpdates: true,
        enableDarkMode: true,
        digestFrequency: DigestFrequency.DAILY,
      },
    },
    {
      id: 'demo-provider-user-1',
      email: 'provider.berlin@example.com',
      firstName: 'Sophia',
      lastName: 'Keller',
      roles: [UserRole.PROVIDER],
      preferredLocale: 'de',
      preferences: {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'demo-provider-user-2',
      email: 'provider.office2@example.com',
      firstName: 'Jonas',
      lastName: 'Fischer',
      roles: [UserRole.PROVIDER],
      preferredLocale: 'de',
      preferences: {
        marketingEmails: false,
        productUpdates: false,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'demo-provider-user-4',
      email: 'provider.office4@example.com',
      firstName: 'Emily',
      lastName: 'Hartmann',
      roles: [UserRole.PROVIDER],
      preferredLocale: 'de',
      preferences: {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'system-match-engine',
      email: 'match.engine@saubio.io',
      firstName: 'Match',
      lastName: 'Engine',
      roles: [UserRole.ADMIN],
      preferredLocale: 'en',
      preferences: {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'system-ops-agent',
      email: 'ops.agent@saubio.io',
      firstName: 'Ops',
      lastName: 'Agent',
      roles: [UserRole.ADMIN],
      preferredLocale: 'en',
      preferences: {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'admin-mahamadi',
      email: 'admin@mahamadicongo.com',
      firstName: 'Mahamadi',
      lastName: 'Admin',
      roles: [UserRole.ADMIN],
      preferredLocale: 'fr',
      password: 'Africadmc01',
      preferences: {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'admin-saubio',
      email: 'admin@saubio.de',
      firstName: 'Saubio',
      lastName: 'Admin',
      roles: [UserRole.ADMIN],
      preferredLocale: 'de',
      password: 'Saubioadmin01',
      preferences: {
        marketingEmails: false,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
    {
      id: 'provider-dmc-user',
      email: 'dmc@mahamadicongo.com',
      firstName: 'DMC',
      lastName: 'Services',
      roles: [UserRole.PROVIDER],
      preferredLocale: 'fr',
      password: 'Africadmc01',
      preferences: {
        marketingEmails: true,
        productUpdates: true,
        enableDarkMode: false,
        digestFrequency: DigestFrequency.WEEKLY,
      },
    },
  ];

  for (const user of users) {
    const hashedPassword = user.password ? await bcrypt.hash(user.password, 12) : undefined;
    const normalizedEmail = user.email.toLowerCase();

    const dbUser = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        email: normalizedEmail,
        firstName: user.firstName,
        lastName: user.lastName,
        preferredLocale: user.preferredLocale,
        roles: { set: user.roles },
        ...(hashedPassword ? { hashedPassword } : {}),
      },
      include: {
        preference: true,
      },
      create: {
        id: user.id,
        email: normalizedEmail,
        firstName: user.firstName,
        lastName: user.lastName,
        preferredLocale: user.preferredLocale,
        roles: user.roles,
        hashedPassword,
      },
    });

    userIdMap.set(user.id, dbUser.id);

    await prisma.userPreference.upsert({
      where: { userId: dbUser.id },
      update: {
        marketingEmails: user.preferences?.marketingEmails ?? false,
        productUpdates: user.preferences?.productUpdates ?? true,
        enableDarkMode: user.preferences?.enableDarkMode ?? false,
        digestFrequency: user.preferences?.digestFrequency ?? DigestFrequency.WEEKLY,
      },
      create: {
        user: { connect: { id: dbUser.id } },
        marketingEmails: user.preferences?.marketingEmails ?? false,
        productUpdates: user.preferences?.productUpdates ?? true,
        enableDarkMode: user.preferences?.enableDarkMode ?? false,
        digestFrequency: user.preferences?.digestFrequency ?? DigestFrequency.WEEKLY,
      },
    });
  }

  return userIdMap;
}

async function upsertProviders(prisma: PrismaClient, resolveUserId: UserIdResolver) {
  const uid = resolveUserId;
  const onboardingDefaults = {
    gender: 'female',
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
    birthCity: 'Berlin',
    birthCountry: 'DE',
    nationality: 'DE',
    termsAcceptedAt: new Date(),
    addressStreetLine1: 'Friedrichstraße 1',
    addressPostalCode: '10117',
    addressCity: 'Berlin',
    addressRegion: 'BE',
    identityCompletedAt: new Date(),
    addressCompletedAt: new Date(),
    profileCompletedAt: new Date(),
    pricingCompletedAt: new Date(),
    phoneVerifiedAt: new Date(),
    onboardingStatus: 'ready',
    payoutReady: true,
    kycStatus: 'verified',
  };
  await prisma.providerProfile.upsert({
    where: { id: 'provider-berlin-1' },
    update: {
      ...onboardingDefaults,
      providerType: ProviderType.FREELANCER,
      languages: { set: ['de', 'en'] },
      serviceAreas: { set: ['Berlin'] },
      serviceCategories: { set: ['residential', 'eco_plus'] },
      hourlyRateCents: 2200,
      offersEco: true,
      acceptsAnimals: true,
    },
    create: {
      ...onboardingDefaults,
      id: 'provider-berlin-1',
      user: { connect: { id: uid('demo-provider-user-1') } },
      providerType: ProviderType.FREELANCER,
      languages: ['de', 'en'],
      serviceAreas: ['Berlin'],
      serviceCategories: ['residential', 'eco_plus'],
      hourlyRateCents: 2200,
      offersEco: true,
      acceptsAnimals: true,
    },
  });

  await prisma.providerProfile.upsert({
    where: { id: 'provider-office-2' },
    update: {
      ...onboardingDefaults,
      providerType: ProviderType.COMPANY,
      languages: { set: ['de'] },
      serviceAreas: { set: ['Berlin'] },
      serviceCategories: { set: ['office'] },
      hourlyRateCents: 3200,
      offersEco: false,
      acceptsAnimals: false,
    },
    create: {
      ...onboardingDefaults,
      id: 'provider-office-2',
      user: { connect: { id: uid('demo-provider-user-2') } },
      providerType: ProviderType.COMPANY,
      languages: ['de'],
      serviceAreas: ['Berlin'],
      serviceCategories: ['office'],
      hourlyRateCents: 3200,
      offersEco: false,
      acceptsAnimals: false,
    },
  });

  await prisma.providerProfile.upsert({
    where: { id: 'provider-office-4' },
    update: {
      ...onboardingDefaults,
      providerType: ProviderType.COMPANY,
      languages: { set: ['de', 'en'] },
      serviceAreas: { set: ['Berlin'] },
      serviceCategories: { set: ['office'] },
      hourlyRateCents: 3400,
      offersEco: true,
      acceptsAnimals: true,
    },
    create: {
      ...onboardingDefaults,
      id: 'provider-office-4',
      user: { connect: { id: uid('demo-provider-user-4') } },
      providerType: ProviderType.COMPANY,
      languages: ['de', 'en'],
      serviceAreas: ['Berlin'],
      serviceCategories: ['office'],
      hourlyRateCents: 3400,
      offersEco: true,
      acceptsAnimals: true,
    },
  });

  await prisma.providerProfile.upsert({
    where: { id: 'provider-dmc-profile' },
    update: {
      ...onboardingDefaults,
      providerType: ProviderType.FREELANCER,
      languages: { set: ['fr', 'de'] },
      serviceAreas: { set: ['Berlin', 'Potsdam'] },
      serviceCategories: { set: ['residential', 'office', 'eco_plus'] },
      hourlyRateCents: 2600,
      offersEco: true,
      acceptsAnimals: true,
    },
    create: {
      ...onboardingDefaults,
      id: 'provider-dmc-profile',
      user: { connect: { id: uid('provider-dmc-user') } },
      providerType: ProviderType.FREELANCER,
      languages: ['fr', 'de'],
      serviceAreas: ['Berlin', 'Potsdam'],
      serviceCategories: ['residential', 'office', 'eco_plus'],
      hourlyRateCents: 2600,
      offersEco: true,
      acceptsAnimals: true,
    },
  });
}

async function upsertCompany(prisma: PrismaClient, resolveUserId: UserIdResolver) {
  const uid = resolveUserId;
  await prisma.company.upsert({
    where: { id: 'demo-company-berlin' },
    update: {
      name: 'Eco Offices GmbH',
      billingEmail: 'finance@eco-offices.de',
      phone: '+49 30 1234567',
      streetLine1: 'Alexanderplatz 4',
      streetLine2: 'Floor 12',
      postalCode: '10178',
      city: 'Berlin',
      countryCode: 'DE',
      locales: { set: ['de'] },
      owner: { connect: { id: uid('demo-client-2') } },
    },
    create: {
      id: 'demo-company-berlin',
      name: 'Eco Offices GmbH',
      billingEmail: 'finance@eco-offices.de',
      phone: '+49 30 1234567',
      streetLine1: 'Alexanderplatz 4',
      streetLine2: 'Floor 12',
      postalCode: '10178',
      city: 'Berlin',
      countryCode: 'DE',
      owner: { connect: { id: uid('demo-client-2') } },
    },
  });
}

async function upsertBookings(prisma: PrismaClient, resolveUserId: UserIdResolver) {
  const uid = resolveUserId;
  const bookingOneStart = minutesAgo(-120);
  const bookingOneEnd = minutesAgo(-30);

  await prisma.booking.upsert({
    where: { id: 'demo-booking-1' },
    create: {
      id: 'demo-booking-1',
      client: { connect: { id: uid('demo-client-1') } },
      service: 'residential',
      surfacesSquareMeters: 120,
      startAt: bookingOneStart,
      endAt: bookingOneEnd,
      frequency: CleaningFrequency.WEEKLY,
      mode: BookingMode.SMART_MATCH,
      ecoPreference: EcoPreference.BIO,
      addressStreetLine1: 'Rosenthaler Str. 1',
      addressStreetLine2: null,
      addressPostalCode: '10119',
      addressCity: 'Berlin',
      addressCountryCode: 'DE',
      addressAccessNotes: '3rd floor, elevator code 2309',
      status: BookingStatus.CONFIRMED,
      pricingSubtotalCents: 18000,
      pricingEcoCents: 2700,
      pricingExtrasCents: 0,
      pricingTaxCents: 3933,
      pricingCurrency: 'EUR',
      pricingTotalCents: 24633,
      notes: 'Please use eco-only products, windows once per month.',
      assignments: {
        create: [{ provider: { connect: { id: 'provider-berlin-1' } } }],
      },
      auditLog: {
        create: [
          {
            createdAt: hoursAgo(72),
            actor: { connect: { id: uid('demo-client-1') } },
            action: 'created',
            metadata: { status: 'pending_provider', providerIds: ['provider-berlin-1'] },
          },
          {
            createdAt: hoursAgo(36),
            actor: { connect: { id: uid('system-match-engine') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-berlin-1' },
          },
          {
            createdAt: minutesAgo(90),
            actor: { connect: { id: uid('demo-client-1') } },
            action: 'status_changed',
            metadata: { from: 'pending_provider', to: 'confirmed' },
          },
        ],
      },
    },
    update: {
      client: { connect: { id: uid('demo-client-1') } },
      company: { disconnect: true },
      service: 'residential',
      surfacesSquareMeters: 120,
      startAt: bookingOneStart,
      endAt: bookingOneEnd,
      frequency: CleaningFrequency.WEEKLY,
      mode: BookingMode.SMART_MATCH,
      ecoPreference: EcoPreference.BIO,
      addressStreetLine1: 'Rosenthaler Str. 1',
      addressStreetLine2: null,
      addressPostalCode: '10119',
      addressCity: 'Berlin',
      addressCountryCode: 'DE',
      addressAccessNotes: '3rd floor, elevator code 2309',
      status: BookingStatus.CONFIRMED,
      pricingSubtotalCents: 18000,
      pricingEcoCents: 2700,
      pricingExtrasCents: 0,
      pricingTaxCents: 3933,
      pricingCurrency: 'EUR',
      pricingTotalCents: 24633,
      notes: 'Please use eco-only products, windows once per month.',
      assignments: {
        deleteMany: {},
        create: [{ provider: { connect: { id: 'provider-berlin-1' } } }],
      },
      auditLog: {
        deleteMany: {},
        create: [
          {
            createdAt: hoursAgo(72),
            actor: { connect: { id: uid('demo-client-1') } },
            action: 'created',
            metadata: { status: 'pending_provider', providerIds: ['provider-berlin-1'] },
          },
          {
            createdAt: hoursAgo(36),
            actor: { connect: { id: uid('system-match-engine') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-berlin-1' },
          },
          {
            createdAt: minutesAgo(90),
            actor: { connect: { id: uid('demo-client-1') } },
            action: 'status_changed',
            metadata: { from: 'pending_provider', to: 'confirmed' },
          },
        ],
      },
    },
  });

  const bookingTwoStart = minutesAgo(-60);
  const bookingTwoEnd = minutesAgo(60);

  await prisma.booking.upsert({
    where: { id: 'demo-booking-2' },
    create: {
      id: 'demo-booking-2',
      client: { connect: { id: uid('demo-client-2') } },
      company: { connect: { id: 'demo-company-berlin' } },
      service: 'office',
      surfacesSquareMeters: 420,
      startAt: bookingTwoStart,
      endAt: bookingTwoEnd,
      frequency: CleaningFrequency.WEEKLY,
      mode: BookingMode.MANUAL,
      ecoPreference: EcoPreference.STANDARD,
      addressStreetLine1: 'Alexanderplatz 4',
      addressStreetLine2: 'Floor 12',
      addressPostalCode: '10178',
      addressCity: 'Berlin',
      addressCountryCode: 'DE',
      addressAccessNotes: 'Security badge at reception',
      status: BookingStatus.IN_PROGRESS,
      pricingSubtotalCents: 78000,
      pricingEcoCents: 0,
      pricingExtrasCents: 5000,
      pricingTaxCents: 15730,
      pricingCurrency: 'EUR',
      pricingTotalCents: 98730,
      notes: 'Night shift crew, focus on meeting rooms.',
      assignments: {
        create: [
          { provider: { connect: { id: 'provider-office-2' } } },
          { provider: { connect: { id: 'provider-office-4' } } },
        ],
      },
      auditLog: {
        create: [
          {
            createdAt: hoursAgo(48),
            actor: { connect: { id: uid('demo-client-2') } },
            action: 'created',
            metadata: {
              status: 'pending_provider',
              providerIds: ['provider-office-2', 'provider-office-4'],
            },
          },
          {
            createdAt: hoursAgo(30),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-office-2' },
          },
          {
            createdAt: hoursAgo(26),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-office-3' },
          },
          {
            createdAt: hoursAgo(20),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_removed',
            metadata: { providerId: 'provider-office-3' },
          },
          {
            createdAt: hoursAgo(12),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-office-4' },
          },
          {
            createdAt: hoursAgo(2),
            actor: { connect: { id: uid('demo-client-2') } },
            action: 'status_changed',
            metadata: { from: 'confirmed', to: 'in_progress' },
          },
        ],
      },
    },
    update: {
      client: { connect: { id: uid('demo-client-2') } },
      company: { connect: { id: 'demo-company-berlin' } },
      service: 'office',
      surfacesSquareMeters: 420,
      startAt: bookingTwoStart,
      endAt: bookingTwoEnd,
      frequency: CleaningFrequency.WEEKLY,
      mode: BookingMode.MANUAL,
      ecoPreference: EcoPreference.STANDARD,
      addressStreetLine1: 'Alexanderplatz 4',
      addressStreetLine2: 'Floor 12',
      addressPostalCode: '10178',
      addressCity: 'Berlin',
      addressCountryCode: 'DE',
      addressAccessNotes: 'Security badge at reception',
      status: BookingStatus.IN_PROGRESS,
      pricingSubtotalCents: 78000,
      pricingEcoCents: 0,
      pricingExtrasCents: 5000,
      pricingTaxCents: 15730,
      pricingCurrency: 'EUR',
      pricingTotalCents: 98730,
      notes: 'Night shift crew, focus on meeting rooms.',
      assignments: {
        deleteMany: {},
        create: [
          { provider: { connect: { id: 'provider-office-2' } } },
          { provider: { connect: { id: 'provider-office-4' } } },
        ],
      },
      auditLog: {
        deleteMany: {},
        create: [
          {
            createdAt: hoursAgo(48),
            actor: { connect: { id: uid('demo-client-2') } },
            action: 'created',
            metadata: {
              status: 'pending_provider',
              providerIds: ['provider-office-2', 'provider-office-4'],
            },
          },
          {
            createdAt: hoursAgo(30),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-office-2' },
          },
          {
            createdAt: hoursAgo(26),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-office-3' },
          },
          {
            createdAt: hoursAgo(20),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_removed',
            metadata: { providerId: 'provider-office-3' },
          },
          {
            createdAt: hoursAgo(12),
            actor: { connect: { id: uid('system-ops-agent') } },
            action: 'provider_assigned',
            metadata: { providerId: 'provider-office-4' },
          },
          {
            createdAt: hoursAgo(2),
            actor: { connect: { id: uid('demo-client-2') } },
            action: 'status_changed',
            metadata: { from: 'confirmed', to: 'in_progress' },
          },
        ],
      },
    },
  });

  const bookingThreeStart = minutesAgo(-30);
  const bookingThreeEnd = minutesAgo(150);

  await prisma.booking.upsert({
    where: { id: 'demo-booking-3' },
    create: {
      id: 'demo-booking-3',
      client: { connect: { id: uid('demo-client-3') } },
      service: 'eco_plus',
      surfacesSquareMeters: 90,
      startAt: bookingThreeStart,
      endAt: bookingThreeEnd,
      frequency: CleaningFrequency.ONCE,
      mode: BookingMode.SMART_MATCH,
      ecoPreference: EcoPreference.BIO,
      addressStreetLine1: 'Gärtnerstr. 12',
      addressStreetLine2: null,
      addressPostalCode: '10245',
      addressCity: 'Berlin',
      addressCountryCode: 'DE',
      addressAccessNotes: 'Key box code 5542',
      status: BookingStatus.CANCELLED,
      pricingSubtotalCents: 15000,
      pricingEcoCents: 2250,
      pricingExtrasCents: 0,
      pricingTaxCents: 3307,
      pricingCurrency: 'EUR',
      pricingTotalCents: 20557,
      notes: 'Client requested postponement due to illness.',
      auditLog: {
        create: [
          {
            createdAt: hoursAgo(12),
            actor: { connect: { id: uid('demo-client-3') } },
            action: 'created',
            metadata: { status: 'pending_provider', providerIds: [] },
          },
          {
            createdAt: hoursAgo(2),
            actor: { connect: { id: uid('demo-client-3') } },
            action: 'status_changed',
            metadata: { from: 'pending_provider', to: 'cancelled', reason: 'client_cancelled' },
          },
        ],
      },
    },
    update: {
      client: { connect: { id: uid('demo-client-3') } },
      company: { disconnect: true },
      service: 'eco_plus',
      surfacesSquareMeters: 90,
      startAt: bookingThreeStart,
      endAt: bookingThreeEnd,
      frequency: CleaningFrequency.ONCE,
      mode: BookingMode.SMART_MATCH,
      ecoPreference: EcoPreference.BIO,
      addressStreetLine1: 'Gärtnerstr. 12',
      addressStreetLine2: null,
      addressPostalCode: '10245',
      addressCity: 'Berlin',
      addressCountryCode: 'DE',
      addressAccessNotes: 'Key box code 5542',
      status: BookingStatus.CANCELLED,
      pricingSubtotalCents: 15000,
      pricingEcoCents: 2250,
      pricingExtrasCents: 0,
      pricingTaxCents: 3307,
      pricingCurrency: 'EUR',
      pricingTotalCents: 20557,
      notes: 'Client requested postponement due to illness.',
      assignments: { deleteMany: {} },
      auditLog: {
        deleteMany: {},
        create: [
          {
            createdAt: hoursAgo(12),
            actor: { connect: { id: uid('demo-client-3') } },
            action: 'created',
            metadata: { status: 'pending_provider', providerIds: [] },
          },
          {
            createdAt: hoursAgo(2),
            actor: { connect: { id: uid('demo-client-3') } },
            action: 'status_changed',
            metadata: { from: 'pending_provider', to: 'cancelled', reason: 'client_cancelled' },
          },
        ],
      },
    },
  });
}

async function upsertSupport(prisma: PrismaClient, resolveUserId: UserIdResolver) {
  const uid = resolveUserId;
  await prisma.supportTicket.upsert({
    where: { id: 'support-ticket-1' },
    update: {
      status: SupportStatus.IN_PROGRESS,
      assignee: { connect: { id: uid('system-ops-agent') } },
      priority: SupportPriority.HIGH,
      messages: {
        deleteMany: {},
        create: [
          {
            content: 'Bonjour, besoin d’aide pour replanifier une intervention bio.',
            author: { connect: { id: uid('demo-client-1') } },
            createdAt: hoursAgo(3),
          },
          {
            content: 'Nous avons reprogrammé la mission pour demain 8h. Confirmez-vous ? ',
            author: { connect: { id: uid('system-ops-agent') } },
            createdAt: hoursAgo(1.5),
          },
        ],
      },
    },
    create: {
      id: 'support-ticket-1',
      category: SupportCategory.ONBOARDING,
      priority: SupportPriority.HIGH,
      status: SupportStatus.IN_PROGRESS,
      subject: 'Replanification mission eco_plus',
      description: 'Besoin de décaler la mission eco_plus à demain matin.',
      requester: { connect: { id: uid('demo-client-1') } },
      assignee: { connect: { id: uid('system-ops-agent') } },
      dueAt: minutesAgo(-30),
      messages: {
        create: [
          {
            content: 'Bonjour, besoin d’aide pour replanifier une intervention bio.',
            author: { connect: { id: uid('demo-client-1') } },
            createdAt: hoursAgo(3),
          },
          {
            content: 'Nous avons reprogrammé la mission pour demain 8h. Confirmez-vous ? ',
            author: { connect: { id: uid('system-ops-agent') } },
            createdAt: hoursAgo(1.5),
          },
        ],
      },
    },
  });

  await prisma.supportTicket.upsert({
    where: { id: 'support-ticket-2' },
    update: {
      status: SupportStatus.RESOLVED,
      assignee: { connect: { id: uid('system-ops-agent') } },
      priority: SupportPriority.MEDIUM,
      messages: {
        deleteMany: {},
        create: [
          {
            content: 'Ticket résolu, facture renvoyée au client.',
            author: { connect: { id: uid('system-ops-agent') } },
            createdAt: hoursAgo(6),
          },
        ],
      },
    },
    create: {
      id: 'support-ticket-2',
      category: SupportCategory.BILLING,
      priority: SupportPriority.MEDIUM,
      status: SupportStatus.RESOLVED,
      subject: 'Facture manquante mission bureau',
      description: 'Le PDF de facture pour la mission office n’est pas disponible.',
      requester: { connect: { id: uid('demo-client-2') } },
      assignee: { connect: { id: uid('system-ops-agent') } },
      messages: {
        create: [
          {
            content: 'Bonjour, la facture pour la mission office n’est pas accessible.',
            author: { connect: { id: uid('demo-client-2') } },
            createdAt: hoursAgo(10),
          },
          {
            content: 'Nous venons de régénérer la facture. Vous pouvez la télécharger depuis votre espace.',
            author: { connect: { id: uid('system-ops-agent') } },
            createdAt: hoursAgo(6),
          },
        ],
      },
    },
  });
}

async function upsertNotifications(prisma: PrismaClient, resolveUserId: UserIdResolver) {
  const uid = resolveUserId;
  const notifications = [
    {
      id: 'notif-booking-1',
      userId: uid('demo-client-1'),
      type: NotificationType.BOOKING_STATUS,
      payload: {
        bookingId: 'demo-booking-1',
        status: 'confirmed',
        message: 'Votre mission residential est confirmée pour demain 08:00.'
      },
      readAt: null,
      createdAt: hoursAgo(4),
    },
    {
      id: 'notif-support-1',
      userId: uid('demo-client-2'),
      type: NotificationType.SUPPORT_UPDATE,
      payload: {
        ticketId: 'support-ticket-2',
        status: 'resolved',
        subject: 'Facture manquante mission bureau'
      },
      readAt: hoursAgo(1),
      createdAt: hoursAgo(5),
    },
    {
      id: 'notif-billing-1',
      userId: uid('demo-client-3'),
      type: NotificationType.BILLING,
      payload: {
        bookingId: 'demo-booking-3',
        invoiceUrl: '/invoices/demo-booking-3.pdf',
        amount: 205.57,
      },
      readAt: null,
      createdAt: hoursAgo(8),
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      update: {
        type: notification.type,
        payload: notification.payload,
        userId: notification.userId,
        readAt: notification.readAt,
      },
      create: {
        id: notification.id,
        type: notification.type,
        payload: notification.payload,
        userId: notification.userId,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      },
    });
  }

  const preferences = [
    {
      userId: uid('demo-client-1'),
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      mutedTypes: [] as NotificationType[],
      language: 'de',
    },
    {
      userId: uid('demo-client-2'),
      channels: [NotificationChannel.IN_APP],
      mutedTypes: [NotificationType.SUPPORT_UPDATE],
      language: 'de',
    },
  ];

  for (const pref of preferences) {
    await prisma.notificationPreference.upsert({
      where: { userId: pref.userId },
      update: {
        channels: { set: pref.channels },
        mutedTypes: { set: pref.mutedTypes },
        language: pref.language,
      },
      create: {
        userId: pref.userId,
        channels: pref.channels,
        mutedTypes: pref.mutedTypes,
        language: pref.language,
      },
    });
  }
}

async function upsertProfileAudits(prisma: PrismaClient, resolveUserId: UserIdResolver) {
  await prisma.userProfileAudit.upsert({
    where: { id: 'profile-audit-1' },
    update: {
      field: 'phone',
      oldValue: '+49 30 0000000',
      newValue: '+49 30 1234567',
    },
    create: {
      id: 'profile-audit-1',
      user: { connect: { id: resolveUserId('demo-client-1') } },
      field: 'phone',
      oldValue: '+49 30 0000000',
      newValue: '+49 30 1234567',
      createdAt: hoursAgo(12),
    },
  });
}

async function upsertPricingRules(prisma: PrismaClient) {
  const rules = [
    {
      code: 'BASE_RATE_M2',
      type: PricingRuleType.BASE_RATE,
      description: 'Tarif standard au mètre carré pour les missions ponctuelles',
      amountCents: 250,
      priority: 10,
    },
    {
      code: 'ECO_BIO_BPS',
      type: PricingRuleType.ECO_SURCHARGE,
      description: 'Majoration (basis points) pour l’option Bio',
      percentageBps: 1500,
      priority: 20,
    },
    {
      code: 'LOYALTY_VALUE_PER_POINT',
      type: PricingRuleType.LOYALTY_REDEEM,
      description: 'Valeur (en centimes) d’un point fidélité appliqué en remise',
      amountCents: 10,
      priority: 30,
    },
    {
      code: 'LOYALTY_EARN_PER_EURO',
      type: PricingRuleType.LOYALTY_EARN,
      description: 'Points gagnés par euro réellement débité',
      multiplier: 1.5,
      priority: 40,
    },
    {
      code: 'LOYALTY_MAX_REDEEM_BPS',
      type: PricingRuleType.LOYALTY_REDEEM,
      description: 'Plafond de remise via fidélité (basis points du montant HT)',
      percentageBps: 2000,
      priority: 50,
    },
  ];

  for (const rule of rules) {
    await prisma.pricingRule.upsert({
      where: { code: rule.code },
      update: {
        type: rule.type,
        description: rule.description,
        amountCents: rule.amountCents ?? null,
        percentageBps: rule.percentageBps ?? null,
        multiplier: rule.multiplier ?? null,
        priority: rule.priority,
        audience: PricingRuleAudience.GENERAL,
        isActive: true,
      },
      create: {
        code: rule.code,
        type: rule.type,
        description: rule.description,
        amountCents: rule.amountCents ?? null,
        percentageBps: rule.percentageBps ?? null,
        multiplier: rule.multiplier ?? null,
        priority: rule.priority,
        audience: PricingRuleAudience.GENERAL,
        isActive: true,
      },
    });
  }
}

async function upsertLoyalty(prisma: PrismaClient, resolveUserId: UserIdResolver) {
  const entries = [
    {
      userId: resolveUserId('demo-client-1'),
      points: 480,
      lifetimeEarned: 600,
      lifetimeRedeemed: 120,
      transactions: [
        {
          id: 'loyalty-tx-1',
          type: LoyaltyTransactionType.EARN,
          points: 600,
          bookingId: 'demo-booking-1',
          metadata: { source: 'seed', note: 'Inscription programme fidélité' },
        },
        {
          id: 'loyalty-tx-2',
          type: LoyaltyTransactionType.REDEEM,
          points: 120,
          bookingId: 'demo-booking-3',
          metadata: { creditsAppliedCents: 1200 },
        },
      ],
    },
    {
      userId: resolveUserId('demo-client-2'),
      points: 150,
      lifetimeEarned: 150,
      lifetimeRedeemed: 0,
      transactions: [
        {
          id: 'loyalty-tx-3',
          type: LoyaltyTransactionType.EARN,
          points: 150,
          bookingId: 'demo-booking-2',
          metadata: { source: 'seed' },
        },
      ],
    },
  ];

  for (const entry of entries) {
    const balance = await prisma.loyaltyBalance.upsert({
      where: { clientId: entry.userId },
      update: {
        points: entry.points,
        lifetimeEarned: entry.lifetimeEarned,
        lifetimeRedeemed: entry.lifetimeRedeemed,
        lastEarnedAt: entry.lifetimeEarned > 0 ? hoursAgo(24) : null,
        lastRedeemedAt: entry.lifetimeRedeemed > 0 ? hoursAgo(12) : null,
      },
      create: {
        clientId: entry.userId,
        points: entry.points,
        lifetimeEarned: entry.lifetimeEarned,
        lifetimeRedeemed: entry.lifetimeRedeemed,
        lastEarnedAt: entry.lifetimeEarned > 0 ? hoursAgo(24) : null,
        lastRedeemedAt: entry.lifetimeRedeemed > 0 ? hoursAgo(12) : null,
      },
    });

    await prisma.clientProfile.updateMany({
      where: { userId: entry.userId },
      data: { loyaltyPoints: entry.points },
    });

    for (const tx of entry.transactions) {
      await prisma.loyaltyTransaction.upsert({
        where: { id: tx.id },
        update: {
          balance: { connect: { id: balance.id } },
          type: tx.type,
          points: tx.points,
          metadata: tx.metadata ?? undefined,
        },
        create: {
          id: tx.id,
          balance: { connect: { id: balance.id } },
          type: tx.type,
          points: tx.points,
          booking: tx.bookingId ? { connect: { id: tx.bookingId } } : undefined,
          metadata: tx.metadata ?? undefined,
        },
      });
    }
  }
}

export async function seedDemoDatabase(client?: PrismaClient) {
  const prisma = client ?? new PrismaClient();
  const ownsClient = !client;

  try {
    const userIdMap = await upsertUsers(prisma);
    const resolveUserId: UserIdResolver = (id) => userIdMap.get(id) ?? id;
    await upsertProviders(prisma, resolveUserId);
    await upsertCompany(prisma, resolveUserId);
    await upsertPricingRules(prisma);
    await upsertBookings(prisma, resolveUserId);
    await upsertLoyalty(prisma, resolveUserId);
    await upsertSupport(prisma, resolveUserId);
    await upsertNotifications(prisma, resolveUserId);
    await upsertProfileAudits(prisma, resolveUserId);
  } catch (error) {
    throw error;
  } finally {
    if (ownsClient) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  seedDemoDatabase()
    .then(() => {
      console.log('Seed data applied successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed', error);
      process.exit(1);
    });
}
