import type {
  BookingPreview,
  BookingRequest,
  BookingStatus,
  PaymentRecord,
  ProviderProfile,
} from './models';
import type { AuthResponse, CreateBookingPayload, HealthResponse, LoginPayload } from './api-types';

describe('models types', () => {
  it('allows constructing a booking preview sample', () => {
    const preview: BookingPreview = {
      service: 'office',
      squareMeters: 280,
      preferredMode: 'smart_match',
      frequency: 'weekly',
      ecoPreference: 'bio',
      providerCount: 3,
    };

    expect(preview.providerCount).toBe(3);
  });

  it('supports composing more complex domain entities', () => {
    const provider: ProviderProfile = {
      id: 'provider-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: 'user-1',
      type: 'freelancer',
      languages: ['de', 'en'],
      serviceAreas: ['Berlin'],
      serviceCategories: ['office', 'windows'],
      hourlyRateCents: 3200,
      offersEco: true,
      documents: [],
    };

    const booking: BookingRequest = {
      id: 'booking-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: 'client-1',
      address: {
        streetLine1: 'Karl-Marx-Allee 92',
        postalCode: '10243',
        city: 'Berlin',
        countryCode: 'DE',
      },
      service: 'office',
      surfacesSquareMeters: 280,
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
      frequency: 'weekly',
      mode: 'smart_match',
      ecoPreference: 'bio',
      providerIds: [provider.id],
      attachments: [],
      status: 'confirmed',
      pricing: {
        subtotalCents: 15000,
        ecoSurchargeCents: 2250,
        extrasCents: 0,
        taxCents: 3285,
        currency: 'EUR',
        totalCents: 20535,
      },
      auditLog: [],
    };

    const payment: PaymentRecord = {
      id: 'payment-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bookingId: booking.id,
      clientId: booking.clientId,
      amountCents: 20535,
      currency: 'EUR',
      providerDistributions: [
        {
          beneficiaryId: provider.id,
          amountCents: 15000,
          beneficiaryType: 'provider',
          currency: 'EUR',
          payoutStatus: 'pending',
        },
      ],
      platformFeeCents: 2500,
      status: 'authorized',
      method: 'card',
      authorizedAt: new Date().toISOString(),
      occurredAt: new Date().toISOString(),
    };

    const allowedStatuses: BookingStatus[] = [
      'draft',
      'pending_provider',
      'pending_client',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'disputed',
    ];

    expect(allowedStatuses).toContain(booking.status);
    expect(payment.providerDistributions[0].beneficiaryId).toBe(provider.id);
  });

  it('tracks the shape of auth and booking payloads', () => {
    const loginPayload: LoginPayload = {
      email: 'demo@saubio.de',
      password: 'Sup3rSafe!',
    };

    const bookingPayload: CreateBookingPayload = {
      clientId: 'client-1',
      address: {
        streetLine1: 'Alexanderplatz 1',
        postalCode: '10178',
        city: 'Berlin',
        countryCode: 'DE',
      },
      service: 'residential',
      surfacesSquareMeters: 120,
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      frequency: 'once',
      mode: 'manual',
      ecoPreference: 'standard',
      providerIds: [],
      shortNotice: false,
      leadTimeDays: 5,
    };

    const authResponse: AuthResponse = {
      user: {
        id: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        email: loginPayload.email,
        firstName: 'Demo',
        lastName: 'User',
        roles: ['client'],
        preferredLocale: 'de',
        isActive: true,
      },
      tokens: {
        accessToken: 'access',
        refreshToken: 'refresh',
      },
    };

    expect(bookingPayload.surfacesSquareMeters).toBeGreaterThan(0);
    expect(authResponse.user.email).toBe(loginPayload.email);

    const health: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      defaultLocale: 'de',
      supportedLocales: ['de', 'en'],
    };

    expect(health.status).toBe('ok');
  });
});
