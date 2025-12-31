import type {
  Address,
  AddressSuggestion,
  BookingContactDetails,
  BookingInvitationStatus,
  BookingMode,
  BookingRequest,
  BookingServicePreferences,
  BookingStatus,
  CleaningFrequency,
  EcoPreference,
  FallbackTeamCandidate,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationTemplateStatus,
  NotificationAutomationEvent,
  NotificationAutomationAudience,
  NotificationType,
  ProfileAuditEntry,
  ProfileSummary,
  ProviderProfile,
  ProviderServiceType,
  ProviderServiceZone,
  ProviderType,
  ServiceCategory,
  SupportCategory,
  SupportPriority,
  SupportStatus,
  User,
  UserPreferences,
  UserRole,
  DisputeRecord,
  DisputeStatus,
  PaymentStatus,
  PaymentMethod,
  DocumentReference,
  PromoCodeType,
  MarketingLandingStatus,
  ReviewStatus,
  SystemApiKeyStatus,
  SystemDataJobFormat,
  SystemDataJobStatus,
  SystemExportType,
  SystemImportEntity,
  DocumentReviewStatus,
  WebhookDeliveryStatus,
} from './models';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roles: UserRole[];
  preferredLocale: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RefreshPayload {
  refreshToken: string;
}

export interface CreateBookingPayload {
  clientId?: string;
  companyId?: string;
  address: Address;
  billingAddress?: Address;
  service: ServiceCategory;
  contact?: BookingContactDetails;
  onsiteContact?: BookingContactDetails;
  surfacesSquareMeters?: number;
  durationHours?: number;
  recommendedHours?: number;
  durationManuallyAdjusted?: boolean;
  startAt: string;
  endAt: string;
  frequency: CleaningFrequency;
  mode: BookingMode;
  ecoPreference: EcoPreference;
  couponCode?: string;
  servicePreferences?: BookingServicePreferences;
  requiredProviders?: number;
  preferredTeamId?: string;
  providerIds?: string[];
  attachments?: string[];
  notes?: string;
  opsNotes?: string;
  providerNotes?: string;
  reminderAt?: string;
  reminderNotes?: string;
  leadTimeDays?: number;
  shortNotice?: boolean;
  estimatedDepositCents?: number;
  guestToken?: string;
}

export interface CheckoutPaymentIntentResponse {
  required: boolean;
  paymentIntentClientSecret: string | null;
  setupIntentClientSecret: string | null;
  checkoutUrl?: string | null;
  provider?: 'mollie' | 'none';
}

export interface CreatePaymentMandatePayload {
  consumerName: string;
  consumerAccount: string;
  signatureDate?: string;
}

export interface UpdateBookingPayload {
  clientId?: string;
  companyId?: string;
  address?: Partial<Address>;
  billingAddress?: Partial<Address>;
  contact?: BookingContactDetails;
  onsiteContact?: BookingContactDetails;
  service?: ServiceCategory;
  surfacesSquareMeters?: number;
  durationHours?: number;
  recommendedHours?: number;
  durationManuallyAdjusted?: boolean;
  startAt?: string;
  endAt?: string;
  frequency?: CleaningFrequency;
  mode?: BookingMode;
  ecoPreference?: EcoPreference;
  couponCode?: string | null;
  servicePreferences?: BookingServicePreferences;
  requiredProviders?: number;
  preferredTeamId?: string | null;
  providerIds?: string[];
  attachments?: string[];
  notes?: string;
  opsNotes?: string;
  providerNotes?: string;
  reminderAt?: string | null;
  reminderNotes?: string | null;
  status?: BookingRequest['status'];
}

export interface ListBookingsParams {
  status?: BookingStatus;
  statuses?: BookingStatus[];
  mode?: BookingMode;
  fallbackRequested?: boolean;
  fallbackEscalated?: boolean;
  minRetryCount?: number;
  service?: ServiceCategory;
  search?: string;
  city?: string;
  postalCode?: string;
  startFrom?: string;
  startTo?: string;
  shortNotice?: boolean;
  hasProvider?: boolean;
  clientId?: string;
  providerId?: string;
  page?: number;
  pageSize?: number;
}

export interface ProviderTeamMemberInput {
  providerId: string;
  role?: string;
  isLead?: boolean;
  orderIndex?: number;
}

export interface CreateProviderTeamPayload {
  ownerId: string;
  name: string;
  description?: string;
  serviceCategories?: ServiceCategory[];
  preferredSize?: number;
  notes?: string;
  defaultDailyCapacity?: number;
  timezone?: string;
  members: ProviderTeamMemberInput[];
}

export type UpdateProviderTeamPayload = Partial<CreateProviderTeamPayload>;

export interface UpdateProviderMissionPayload {
  status?: BookingRequest['status'];
  note?: string;
  reminderAt?: string | null;
  reminderNote?: string | null;
}

export type AddressSuggestionResponse = AddressSuggestion[];

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  defaultLocale: string;
  supportedLocales: string[];
}

export interface PriceEstimateParams {
  postalCode: string;
  hours: number;
  service?: ServiceCategory;
}

export interface PriceEstimate {
  postalCode: string;
  service?: ServiceCategory;
  hours: number;
  minHourlyRateCents: number | null;
  maxHourlyRateCents: number | null;
  minTotalCents: number | null;
  maxTotalCents: number | null;
  providersConsidered: number;
  currency: 'EUR';
  location?: {
    city?: string;
    district?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
}

export interface PostalCodeLookupResponse {
  postalCode: string;
  city: string;
  area?: string;
  state?: string;
  normalizedCity: string;
}

export interface SupportTicketFilters {
  status?: SupportStatus;
  priority?: SupportPriority;
  search?: string;
}

export interface CreateSupportTicketPayload {
  subject: string;
  description: string;
  category?: SupportCategory;
  priority?: SupportPriority;
}

export interface UpdateSupportTicketPayload {
  status?: SupportStatus;
  priority?: SupportPriority;
  assigneeId?: string | null;
  dueAt?: string | null;
}

export interface CreateSupportMessagePayload {
  content: string;
  internal?: boolean;
}

export interface ListNotificationsParams {
  type?: NotificationType;
  unread?: boolean;
  cursor?: string;
  limit?: number;
  targetUserId?: string;
}

export interface MarkManyNotificationsPayload {
  ids?: string[];
  all?: boolean;
  targetUserId?: string;
}

export interface UpdateNotificationPreferencesPayload {
  channels?: NotificationChannel[];
  mutedTypes?: NotificationType[];
  language?: string;
}

export interface ProviderInvitationFilters {
  status?: BookingInvitationStatus;
  limit?: number;
}

export type ProfileResponse = ProfileSummary & {
  profileAudits: ProfileAuditEntry[];
  preferences?: UserPreferences;
};

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  preferredLocale?: string;
  preferences?: Partial<UserPreferences>;
}

export interface UpdatePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ProviderMissionFilters {
  status?: BookingRequest['status'] | 'all';
  city?: string;
  from?: string;
  to?: string;
  eco?: EcoPreference | 'all';
}

export interface ProviderDirectoryFilters {
  city?: string;
  postalCode?: string;
  service?: ServiceCategory;
  minRateCents?: number;
  maxRateCents?: number;
  minRating?: number;
  minCompletedMissions?: number;
  acceptsAnimals?: boolean;
  availableOn?: string;
  durationHours?: number;
  sort?: 'rate' | 'rating';
  limit?: number;
}

export interface ProviderSearchParams {
  city: string;
  postalCode?: string;
  service: ServiceCategory;
  ecoPreference?: EcoPreference;
  startAt: string;
  endAt: string;
  limit?: number;
}

export interface ProviderSuggestion {
  id: string;
  displayName: string;
  type: ProviderProfile['type'];
  hourlyRateCents: number;
  ratingAverage: number | null;
  ratingCount: number;
  offersEco: boolean;
  languages: string[];
  serviceAreas: string[];
  serviceCategories: ServiceCategory[];
  yearsExperience?: number;
  bio?: string;
  photoUrl?: string;
}

export interface ProviderDirectoryItem {
  id: string;
  displayName: string;
  primaryCity: string | null;
  serviceAreas: string[];
  languages: string[];
  hourlyRateCents: number;
  ratingAverage: number | null;
  ratingCount: number;
  completedMissions: number;
  offersEco: boolean;
  acceptsAnimals?: boolean;
  yearsExperience?: number;
  bio?: string;
  photoUrl?: string;
  gender?: string | null;
}

export interface ProviderReviewSummary {
  id: string;
  authorFirstName: string;
  comment?: string;
  score: number;
  createdAt: string;
}

export interface ProviderDirectoryDetails extends ProviderDirectoryItem {
  verified?: boolean;
  reviews: ProviderReviewSummary[];
}

export type PostalCoverageReason = 'invalid_postal' | 'postal_not_found' | 'uncovered';

export interface PostalCoverageResponse {
  postalCode: string;
  city?: string | null;
  area?: string | null;
  state?: string | null;
  covered: boolean;
  providerCount: number;
  reason?: PostalCoverageReason;
}

export interface PostalFollowUpPayload {
  email: string;
  postalCode: string;
  marketingConsent?: boolean;
}

export interface PostalFollowUpResponse {
  id: string;
  email: string;
  postalCode: string;
  marketingConsent: boolean;
  createdAt: string;
}

export interface ProviderDashboardMissionSummary {
  id: string;
  client: string;
  service: ServiceCategory;
  city: string;
  startAt: string;
  endAt: string;
  status: BookingRequest['status'];
  surfaces: number | null | undefined;
  ecoPreference: EcoPreference;
}

export interface ProviderDashboardScheduleMission {
  id: string;
  client: string;
  city: string;
  service: ServiceCategory;
  startAt: string;
  endAt: string;
  status: BookingRequest['status'];
  durationMinutes: number;
}

export interface ProviderDashboardScheduleDay {
  date: string;
  missions: ProviderDashboardScheduleMission[];
}

export interface ProviderDashboardAlert {
  id: string;
  type: 'quality' | 'safety' | 'availability';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

export interface ProviderDashboardFeedback {
  id: string;
  client: string;
  rating: number;
  message: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  createdAt: string;
}

export interface ProviderDashboardMetrics {
  completed: number;
  revenueCents: number;
  rating: number;
  ecoRate: number;
}

export interface ProviderDashboardTrends {
  completed: number;
  revenue: number;
  rating: number;
  ecoRate: number;
}

export interface ProviderDashboardQuality {
  rating: number;
  incidents: number;
  ecoRate: number;
  responseMinutes: number;
}

export interface ProviderDashboardPaymentsSummary {
  totalCents: number;
  pendingCents: number;
  lastPayoutAt: string | null;
}

export type ProviderEarningStatus = 'upcoming' | 'awaiting_validation' | 'payable' | 'paid';

export interface ProviderMissionEarning {
  id: string;
  bookingId: string;
  service: ServiceCategory;
  startAt: string;
  endAt: string;
  durationHours: number;
  city?: string;
  postalCode?: string;
  client?: string;
  amountCents: number;
  grossCents: number;
  commissionCents: number;
  status: ProviderEarningStatus;
  source: 'distribution' | 'projection';
  expectedPayoutAt?: string | null;
  estimated?: boolean;
  payoutReference?: string | null;
  payoutReleasedAt?: string | null;
}

export interface ProviderEarningsSummary {
  totalEarnedCents: number;
  upcomingCents: number;
  awaitingValidationCents: number;
  payableCents: number;
  paidCents: number;
  missions: {
    upcoming: number;
    awaitingValidation: number;
    payable: number;
    paid: number;
  };
  thisMonthCents: number;
  previousMonthCents: number;
  lastPayoutAt: string | null;
}

export interface ProviderEarningsResponse {
  summary: ProviderEarningsSummary;
  missions: ProviderMissionEarning[];
}

export interface ProviderResourceItem {
  id: string;
  title: string;
  description: string;
  type: 'checklist' | 'document' | 'training';
  url: string;
  updatedAt: string;
}

export interface ProviderDashboardResponse {
  metrics: ProviderDashboardMetrics;
  trends: ProviderDashboardTrends;
  upcoming: ProviderDashboardMissionSummary[];
  schedule: ProviderDashboardScheduleDay[];
  alerts: ProviderDashboardAlert[];
  feedback: ProviderDashboardFeedback[];
  quality: ProviderDashboardQuality;
  payments: ProviderDashboardPaymentsSummary;
  earnings: ProviderEarningsSummary;
  resources: ProviderResourceItem[];
}

export interface ProviderServiceCatalogResponse {
  serviceTypes: ProviderServiceType[];
  selected: ServiceCategory[];
}

export interface UpdateProviderProfilePayload {
  bio?: string | null;
  languages?: string[];
  serviceAreas?: string[];
  serviceZones?: ProviderServiceZone[];
  serviceCategories?: ServiceCategory[];
  hourlyRateCents?: number;
  offersEco?: boolean;
  yearsExperience?: number;
}

export interface CreateProviderOnboardingPayload {
  type: 'freelancer' | 'company';
  contactName: string;
  companyName?: string;
  email: string;
  phone?: string;
  languages: string[];
  serviceAreas: string[];
  message?: string;
}

export interface ProviderPaymentsOnboardingPayload {
  providerId: string;
  type: 'individual' | 'company';
  businessName?: string;
  email: string;
  country?: string;
}

export interface ProviderPayoutSetupPayload {
  accountHolder: string;
  iban: string;
  signatureDate?: string;
}

export interface ProviderBankInfo {
  accountHolder: string | null;
  ibanMasked: string | null;
  bankName?: string | null;
  status: 'inactive' | 'pending' | 'active' | 'failed';
  last4?: string | null;
}

export interface ProviderOnboardingRequest {
  id: string;
  type: 'freelancer' | 'company';
  contactName: string;
  companyName?: string;
  email: string;
  phone?: string;
  languages: string[];
  serviceAreas: string[];
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewer?: string;
}

export interface ProviderIdentityPayload {
  firstName: string;
  lastName: string;
  gender: 'male' | 'female' | 'other';
  birthDate: string;
  birthCity: string;
  birthCountry: string;
  nationality: string;
  acceptTerms: boolean;
}

export type ProviderIdentityDocumentType =
  | 'passport'
  | 'id_card'
  | 'residence_permit'
  | (string & Record<never, never>);

export type ProviderIdentityDocumentStatus = 'submitted' | 'verified' | 'rejected';

export type ProviderIdentityDocumentSide = 'front' | 'back' | 'selfie';

export interface ProviderIdentityDocumentSummary {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  documentType: ProviderIdentityDocumentType;
  status: ProviderIdentityDocumentStatus;
  reviewer?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface IdentityDocumentTypeConfig {
  id: string;
  code: ProviderIdentityDocumentType;
  label: {
    fr: string;
    en?: string;
    de?: string;
  };
  description?: string;
  isDefault: boolean;
  isRequired: boolean;
  requiredFiles: number;
  applicableCountries: string[];
  isActive: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateIdentityDocumentTypePayload {
  code: ProviderIdentityDocumentType;
  labelFr: string;
  labelEn?: string;
  labelDe?: string;
  description?: string;
  isRequired?: boolean;
  requiredFiles?: number;
  applicableCountries?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateIdentityDocumentTypePayload {
  labelFr?: string;
  labelEn?: string;
  labelDe?: string;
  description?: string;
  isRequired?: boolean;
  requiredFiles?: number;
  applicableCountries?: string[];
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProviderIdentityDocumentUploadPayload {
  documentType: ProviderIdentityDocumentType;
  side?: ProviderIdentityDocumentSide;
  fileData: string;
  fileName?: string;
}

export interface ProviderProfilePhotoPayload {
  fileData: string;
  fileName?: string;
}

export interface ProviderIdentityReviewPayload {
  documentId: string;
  status: 'verified' | 'rejected';
  notes?: string;
}

export interface AdminProviderIdentityReview {
  providerId: string;
  name: string;
  email: string;
  status: 'not_started' | 'submitted' | 'verified' | 'rejected';
  reviewer?: string;
  reviewedAt?: string;
  verifiedAt?: string;
  notes?: string;
  welcomeSessionCompletedAt?: string;
  documents: ProviderIdentityDocumentSummary[];
}

export type IdentityAuditAction =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'reset'
  | 'requested_document'
  | 'note';

export interface AdminIdentityVerificationListItem {
  id: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  providerReference: string;
  documentType: ProviderIdentityDocumentType;
  documentLabel: string;
  status: DocumentReviewStatus;
  submittedAt: string;
  currentStatus: 'not_started' | 'submitted' | 'verified' | 'rejected';
  reviewer?: string;
  reviewerId?: string;
  reviewedAt?: string;
  metadata?: Record<string, unknown>;
  reason?: string;
  underReviewBy?: string;
  underReviewById?: string;
  underReviewAt?: string;
  underReviewNotes?: string;
}

export interface AdminIdentityDocumentItem {
  id: string;
  name: string;
  documentType: ProviderIdentityDocumentType;
  documentLabel: string;
  url: string;
  downloadUrl: string;
  status: DocumentReviewStatus;
  side?: ProviderIdentityDocumentSide;
  mimeType?: string;
  underReviewBy?: string;
  underReviewById?: string;
  underReviewAt?: string;
  underReviewNotes?: string;
  submittedAt: string;
  reviewer?: string;
  reviewerId?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface AdminIdentityVerificationDetail {
  provider: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    status: 'not_started' | 'submitted' | 'verified' | 'rejected';
    reviewer?: string;
    reviewerId?: string;
    reviewedAt?: string;
    submittedAt?: string;
    notes?: string;
  };
  documents: AdminIdentityDocumentItem[];
  timeline: AdminIdentityAuditLogItem[];
}

export interface AdminIdentityAuditLogItem {
  id: string;
  providerId: string;
  providerName: string;
  providerEmail?: string;
  documentId?: string;
  documentType?: ProviderIdentityDocumentType;
  documentLabel?: string;
  actorId?: string;
  actorLabel?: string;
  action: IdentityAuditAction;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface AdminGdprRequest {
  id: string;
  type: 'export' | 'deletion' | 'rectification';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
  reason?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  startedBy?: string;
  processedAt?: string;
  processedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectReason?: string;
  exportReadyAt?: string;
  exportExpiresAt?: string;
  exportAvailable: boolean;
}

export interface CreateAdminGdprRequestPayload {
  userId: string;
  type: 'export' | 'deletion' | 'rectification';
  reason?: string;
}

export interface ConfirmAdminGdprDeletionPayload {
  notes?: string;
}

export interface RejectAdminGdprRequestPayload {
  reason: string;
}

export interface AdminConsentRecord {
  id: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
  };
  consentMarketing: boolean;
  consentStats: boolean;
  consentPreferences: boolean;
  consentNecessary: boolean;
  source?: string | null;
  channel?: string | null;
  capturedAt?: string | null;
  firstCapturedAt?: string | null;
  updatedAt: string;
}

export interface AdminConsentHistoryItem {
  id: string;
  userId: string;
  actorId?: string;
  actorLabel?: string | null;
  consentMarketing: boolean;
  consentStats: boolean;
  consentPreferences: boolean;
  consentNecessary: boolean;
  source?: string | null;
  channel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
  capturedAt?: string | null;
  createdAt: string;
}

export interface AdminSecuritySession {
  id: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: UserRole;
  };
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  revokedAt?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminSecurityLoginAttempt {
  id: string;
  email: string;
  userId?: string;
  userRole?: UserRole;
  provider?: string;
  success: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AdminSecurityLog {
  id: string;
  category: 'auth' | 'permissions' | 'webhook' | 'payment' | 'admin' | 'other';
  level: 'info' | 'warn' | 'error';
  message: string;
  requestId?: string;
  actorId?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AdminSecurityIncident {
  id: string;
  title: string;
  description: string;
  category: 'auth' | 'permissions' | 'webhook' | 'payment' | 'admin' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedTo?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  timeline: AdminSecurityIncidentTimeline[];
}

export interface AdminSecurityIncidentTimeline {
  id: string;
  actorId?: string;
  actorLabel?: string;
  action: string;
  message?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAdminSecurityIncidentPayload {
  title: string;
  description: string;
  category?: AdminSecurityIncident['category'];
  severity?: AdminSecurityIncident['severity'];
  assignedToId?: string;
}

export interface UpdateAdminSecurityIncidentPayload {
  title?: string;
  description?: string;
  category?: AdminSecurityIncident['category'];
  severity?: AdminSecurityIncident['severity'];
  status?: AdminSecurityIncident['status'];
  assignedToId?: string | null;
  timelineMessage?: string;
}

export interface ProviderIdentitySessionResponse {
  sdkToken: string;
}

export interface ProviderAddressPayload {
  streetLine1: string;
  streetLine2?: string;
  postalCode: string;
  city: string;
  region?: string;
  country: string;
}

export interface ProviderPhonePayload {
  verificationCode: string;
}

export interface ProviderPhoneRequestPayload {
  phoneNumber: string;
}

export interface ProviderOnboardingTask {
  id:
    | 'account'
    | 'identity'
    | 'address'
    | 'phone'
    | 'profile'
    | 'pricing'
    | 'payments'
    | 'id_check'
    | 'signup_fee'
    | 'welcome_session';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  durationMinutes?: number;
}

export interface ProviderOnboardingStatus {
  progress: number;
  stepsCompleted: number;
  totalSteps: number;
  tasks: ProviderOnboardingTask[];
  allCompleted: boolean;
}

export interface ProviderAvailabilitySlot {
  id: string;
  weekday: number; // 0 (Sunday) to 6 (Saturday)
  startMinutes: number;
  endMinutes: number;
  timezone: string;
  isActive: boolean;
}

export interface ProviderTimeOffEntry {
  id: string;
  startAt: string;
  endAt: string;
  reason?: string;
  status: 'upcoming' | 'active' | 'past';
  durationHours: number;
}

export interface ProviderAvailabilityOverview {
  timezone: string;
  weeklyHours: number;
  slots: ProviderAvailabilitySlot[];
  timeOff: ProviderTimeOffEntry[];
  nextTimeOff?: string | null;
}

export interface UpdateProviderAvailabilityPayload {
  timezone?: string;
  slots: Array<{
    id?: string;
    weekday: number;
    startMinutes: number;
    endMinutes: number;
    isActive?: boolean;
  }>;
}

export interface CreateProviderTimeOffPayload {
  startAt: string;
  endAt: string;
  reason?: string;
}

export interface PayoutBatchSummary {
  id: string;
  createdAt: string;
  scheduledFor: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  trigger: 'AUTO' | 'MANUAL';
  payouts: ProviderPayoutSummary[];
  note?: string;
}

export interface PayoutMissionSummary {
  bookingId: string;
  service: string;
  amountCents: number;
  city?: string;
  startAt?: string;
  endAt?: string;
  clientTotalCents?: number;
}

export interface ProviderPayoutSummary {
  id: string;
  providerId: string;
  providerName: string;
  amountCents: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  missions: PayoutMissionSummary[];
  statementDocument?: ProviderDocumentSummary;
}

export interface ProviderDocumentSummary {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  category?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'invited' | 'suspended';
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUsersOverviewResponse {
  stats: {
    totalUsers: number;
    clients: number;
    providers: {
      total: number;
      active: number;
      pending: number;
      suspended: number;
    };
    employees: number;
    admins: number;
  };
  distribution: Array<{ role: UserRole; value: number }>;
  timeline: Array<{ date: string; clients: number; providers: number }>;
  recent: AdminUser[];
}

export interface AdminPaginatedResponse<TItem> {
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminClientListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  status: 'active' | 'invited' | 'suspended';
  totalBookings: number;
  lastBooking: {
    id: string;
    status: BookingStatus;
    startAt: string;
    totalCents: number;
  } | null;
  totalSpentCents: number;
  type: 'individual' | 'company';
}

export interface AdminClientAddress {
  id: string;
  label: string;
  streetLine1: string;
  streetLine2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
}

export interface AdminClientBookingSummary {
  id: string;
  status: BookingStatus;
  service: string;
  startAt: string;
  totalCents: number;
  providerName: string | null;
}

export interface AdminClientPaymentSummary {
  id: string;
  amountCents: number;
  status: PaymentStatus;
  createdAt: string;
  method: PaymentMethod | null;
  bookingId: string | null;
}

export interface AdminClientDetails extends AdminClientListItem {
  addresses: AdminClientAddress[];
  bookings: AdminClientBookingSummary[];
  payments: AdminClientPaymentSummary[];
}

export interface AdminBookingParty {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface AdminBookingListItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  mode: BookingMode;
  service: ServiceCategory;
  city: string;
  postalCode: string;
  shortNotice: boolean;
  matchingRetryCount: number;
  totalCents: number;
  client: AdminBookingParty;
  provider: AdminBookingParty | null;
  paymentStatus?: PaymentStatus | null;
}

export interface AdminBookingAssignmentSummary {
  id: string;
  provider: AdminBookingParty;
  status: string;
  teamId?: string | null;
  assignedAt: string;
}

export interface AdminBookingPaymentSummary {
  id: string;
  status: PaymentStatus;
  amountCents: number;
  method?: PaymentMethod | null;
  occurredAt: string;
  externalReference?: string | null;
}

export interface AdminBookingDetails extends AdminBookingListItem {
  address: Address;
  billingAddress?: Address;
  contact?: BookingContactDetails;
  onsiteContact?: BookingContactDetails;
  durationHours?: number | null;
  recommendedHours?: number | null;
  frequency: CleaningFrequency;
  ecoPreference: EcoPreference;
  notes?: string;
  opsNotes?: string;
  providerNotes?: string;
  attachments: BookingRequest['attachments'];
  auditLog: BookingRequest['auditLog'];
  fallbackTeamCandidate?: FallbackTeamCandidate | null;
  assignments: AdminBookingAssignmentSummary[];
  payment?: AdminBookingPaymentSummary | null;
  pricing: BookingRequest['pricing'];
}

export interface AdminBookingOverviewResponse {
  totals: {
    all: number;
    upcoming: number;
    completed: number;
    cancelled: number;
    shortNotice: number;
  };
  shortNoticeRatio: number;
  statuses: Array<{ status: BookingStatus; count: number }>;
  paymentStatuses: Array<{ status: PaymentStatus; count: number }>;
  financials: {
    revenueTodayCents: number;
    revenueWeekCents: number;
    revenueMonthCents: number;
    averageBasketCents: number;
  };
  charts: {
    bookingsByDay: Array<{ date: string; total: number }>;
    revenueByWeek: Array<{ week: string; totalCents: number }>;
  };
  recent: AdminBookingListItem[];
}

export interface AdminProviderListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  onboardingStatus: string;
  identityStatus: string;
  payoutStatus: string;
  ratingAverage: number;
  ratingCount: number;
  missionsCompleted: number;
  city: string | null;
  postalCode: string | null;
  serviceCategories: ServiceCategory[];
  status: 'active' | 'invited' | 'suspended';
  payoutReady: boolean;
}

export interface AdminProviderDetails extends AdminProviderListItem {
  createdAt: string;
  serviceAreas: string[];
  languages: string[];
  payoutDetails: {
    accountHolder: string | null;
    ibanMasked: string | null;
    bankName: string | null;
  };
  address: {
    streetLine1: string | null;
    postalCode: string | null;
    city: string | null;
    region: string | null;
  };
}

export interface AdminEmployeeListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  accessRole: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
  status: 'active' | 'invited' | 'suspended';
}

export interface AdminRoleSummary {
  role: UserRole;
  description: string;
  permissions: string[];
  userCount: number;
}

export type AdminPermissionImpact = 'low' | 'medium' | 'high';

export interface AdminPermissionMatrixRoleAccess {
  role: UserRole;
  allowed: boolean;
  scope?: string | null;
}

export interface AdminPermissionMatrixEntry {
  id: string;
  category: string;
  label: string;
  description: string;
  impact: AdminPermissionImpact;
  roles: AdminPermissionMatrixRoleAccess[];
}

export interface AdminRolesResponse {
  roles: AdminRoleSummary[];
  adminAccounts: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    lastLoginAt: string | null;
    status: 'active' | 'invited' | 'suspended';
  }>;
  permissionMatrix: AdminPermissionMatrixEntry[];
  lastReviewedAt?: string | null;
}

export interface AdminFinancePaymentParty {
  id: string;
  name: string;
  email: string;
}

export interface AdminFinancePaymentItem {
  id: string;
  bookingId: string;
  occurredAt: string;
  amountCents: number;
  platformFeeCents: number;
  currency: string;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  provider: string;
  externalReference?: string | null;
  metadataPurpose?: string | null;
  client: AdminFinancePaymentParty;
  service?: string;
  city?: string;
  postalCode?: string;
}

export type ProviderPayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface AdminFinancePayoutItem {
  id: string;
  provider: {
    id: string;
    name: string;
    email: string;
    ibanMasked?: string | null;
    payoutActivationStatus?: string | null;
  };
  amountCents: number;
  currency: string;
  status: ProviderPayoutStatus;
  createdAt: string;
  scheduledAt?: string | null;
  releasedAt?: string | null;
  externalReference?: string | null;
  missions: Array<{ bookingId: string; amountCents: number; service?: string; city?: string; startAt?: string }>;
}

export interface AdminFinanceOverviewResponse {
  range: { from: string; to: string };
  totals: {
    grossRevenueCents: number;
    netRevenueCents: number;
    commissionCents: number;
    payoutPaidCents: number;
    payoutPendingCents: number;
    failedAmountCents: number;
    refundedAmountCents: number;
  };
  counts: {
    paymentsSuccess: number;
    paymentsPending: number;
    paymentsFailed: number;
    paymentsRefunded: number;
  };
  charts: {
    paymentsByDay: Array<{ date: string; grossCents: number; netCents: number; failedCents: number }>;
    payoutsByWeek: Array<{ week: string; amountCents: number }>;
  };
  recent: {
    payments: AdminFinancePaymentItem[];
    payouts: AdminFinancePayoutItem[];
  };
}

export interface AdminFinanceCommissionRow {
  bookingId: string;
  service: string;
  city: string;
  startAt: string;
  totalCents: number;
  providerShareCents: number;
  commissionCents: number;
  taxCents: number;
}

export interface AdminFinanceCommissionsResponse {
  range: { from: string; to: string };
  totals: {
    commissionCents: number;
    providerShareCents: number;
    taxCents: number;
    bookings: number;
  };
  rows: AdminFinanceCommissionRow[];
}

export interface AdminFinanceExportsResponse {
  range: { from: string; to: string };
  available: Array<{
    type: string;
    label: string;
    description?: string;
    formats: string[];
    enabled: boolean;
  }>;
  recent: Array<{
    id: string;
    type: string;
    createdAt: string;
    from: string;
    to: string;
    format: string;
    url?: string;
  }>;
}

export interface AdminFinanceSettingsResponse {
  provider: string;
  mode: 'development' | 'production' | 'test';
  webhookUrl?: string | null;
  webhookHealthy?: boolean | null;
  recentEvents: Array<{ id: string; type: string; status: string; createdAt: string }>;
  mandates: Array<{ id: string; providerId: string; providerName: string; status: string; updatedAt: string }>;
}

export interface AdminFinanceInvoiceRecord {
  id: string;
  bookingId: string | null;
  client: {
    id: string;
    name: string;
    email: string;
  };
  issuedAt: string;
  amountCents: number;
  taxCents?: number | null;
  currency: string;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  downloadUrl?: string | null;
}

export interface AdminFinanceStatementRecord {
  id: string;
  provider: {
    id: string;
    name: string;
    email: string;
  };
  amountCents: number;
  commissionCents?: number | null;
  netAmountCents?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  currency: string;
  status: ProviderPayoutStatus;
  releasedAt?: string | null;
}

export interface AdminFinanceInvoicesResponse {
  range: { from: string; to: string };
  clientInvoices: AdminFinanceInvoiceRecord[];
  providerStatements: AdminFinanceStatementRecord[];
}

export interface AdminAnalyticsRange {
  from: string;
  to: string;
}

export interface AdminAnalyticsOverviewResponse {
  range: AdminAnalyticsRange;
  bookings: {
    created: number;
    paid: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    cancellationRate: {
      overall: number;
      client: number;
      provider: number;
    };
    smartMatchShare: number;
    shortNoticeShare: number;
  };
  payments: {
    grossCents: number;
    commissionCents: number;
    averageOrderValueCents: number | null;
  };
  customers: {
    newClients: number;
    newProviders: number;
  };
  trends: {
    bookings: Array<{ date: string; created: number; completed: number; cancelled: number }>;
    revenue: Array<{ date: string; grossCents: number; commissionCents: number }>;
    providers: Array<{ date: string; activated: number }>;
  };
}

export interface AdminAnalyticsFunnelStep {
  id: string;
  label: string;
  value: number;
  conversionRate: number | null;
}

export interface AdminAnalyticsFunnelResponse {
  range: AdminAnalyticsRange;
  steps: AdminAnalyticsFunnelStep[];
}

export interface AdminAnalyticsCohortRow {
  cohort: string;
  cohortStart: string;
  size: number;
  retention7: number;
  retention30: number;
  retention90: number;
}

export interface AdminAnalyticsCohortResponse {
  type: 'client' | 'provider';
  range: AdminAnalyticsRange;
  cohorts: AdminAnalyticsCohortRow[];
}

export interface AdminAnalyticsZoneRow {
  city: string;
  postalCode: string | null;
  demand: number;
  providerCount: number;
  matchRate: number;
  avgMatchDelayMinutes: number | null;
  priceMinCents: number;
  priceAvgCents: number;
  priceMaxCents: number;
  tensionIndex: number;
}

export interface AdminAnalyticsZonesResponse {
  range: AdminAnalyticsRange;
  rows: AdminAnalyticsZoneRow[];
  topCities: Array<{ city: string; demand: number }>;
}

export interface AdminAnalyticsOpsResponse {
  range: AdminAnalyticsRange;
  cancellations: {
    total: number;
    client: number;
    provider: number;
    admin: number;
    trend: Array<{ date: string; total: number }>;
  };
  disputes: {
    opened: number;
    resolved: number;
    refundCents: number;
  };
  support: {
    ticketsOpened: number;
    ticketsResolved: number;
    avgResolutionHours: number | null;
  };
  smartMatch: {
    invitations: number;
    acceptanceRate: number;
    avgResponseMinutes: number | null;
  };
  quality: {
    averageRating: number | null;
    incidentCount: number;
  };
}

export interface AdminPromoCodeListItem {
  id: string;
  code: string;
  description: string;
  type: PromoCodeType;
  valueCents: number | null;
  valuePercent: number | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  usageCount: number;
  maxTotalUsages: number | null;
  lastUsedAt: string | null;
}

export interface AdminPromoCodeDetail {
  id: string;
  code: string;
  description: string;
  type: PromoCodeType;
  fixedAmountCents: number | null;
  percentage: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxTotalUsages: number | null;
  maxUsagesPerUser: number | null;
  minBookingTotalCents: number | null;
  applicableServices: string[];
  applicablePostalCodes: string[];
  isActive: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string } | null;
}

export interface AdminPromoCodeUsageRecord {
  id: string;
  promoCodeId: string;
  code: string;
  bookingId: string | null;
  bookingStatus: BookingStatus | null;
  bookingService: string | null;
  bookingCity: string | null;
  bookingPostalCode: string | null;
  bookingAmountCents: number | null;
  client: { id: string; name: string; email: string } | null;
  usedAt: string;
  discountCents: number;
  currency: string;
  status: string;
}

export interface AdminMarketingOverviewResponse {
  stats: {
    activePromoCodes: number;
    bookingsWithPromo: number;
    discountGrantedCents: number;
  };
  topCodes: Array<{ id: string; code: string; usageCount: number; discountCents: number }>;
  recentUsages: AdminPromoCodeUsageRecord[];
  timeline: Array<{ date: string; usages: number; discountCents: number }>;
}

export interface AdminMarketingLandingPageSummary {
  id: string;
  title: string;
  slug: string;
  path: string;
  status: MarketingLandingStatus;
  impressions: number;
  conversions: number;
  leads: number;
  conversionRate: number | null;
  bounceRate: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  updatedAt: string;
}

export interface AdminMarketingLandingPagesResponse {
  total: number;
  pages: AdminMarketingLandingPageSummary[];
}

export interface AdminMarketingSettingsResponse {
  toggles: {
    promoCodesEnabled: boolean;
    referralEnabled: boolean;
    marketingNotificationsEnabled: boolean;
  };
  policy: {
    maxPromoCodesPerClient: number;
    stackingRules: string | null;
    restrictedZones: string | null;
  };
  logs: Array<{
    id: string;
    label: string;
    previousValue: string | null;
    newValue: string | null;
    createdAt: string;
    user: { id: string; name: string; email: string } | null;
  }>;
}

export type AdminSystemStatus = 'ok' | 'degraded' | 'down';

export interface AdminSystemHealthCheck {
  id: string;
  label: string;
  status: AdminSystemStatus;
  message?: string;
  latencyMs?: number;
  metrics?: Record<string, number | string | null>;
  lastCheckedAt?: string;
}

export interface AdminSystemHealthResponse {
  status: AdminSystemStatus;
  updatedAt: string;
  checks: AdminSystemHealthCheck[];
}

export type AdminSystemIntegrationStatus = 'active' | 'warning' | 'inactive';

export interface AdminSystemIntegrationDetail {
  label: string;
  value: string;
  muted?: boolean;
}

export interface AdminSystemIntegrationItem {
  id: string;
  name: string;
  category: string;
  status: AdminSystemIntegrationStatus;
  lastActivityAt?: string;
  details?: AdminSystemIntegrationDetail[];
  links?: Array<{ label: string; url: string }>;
}

export interface AdminSystemIntegrationsResponse {
  integrations: AdminSystemIntegrationItem[];
}

export interface AdminSystemInfoResponse {
  environment: {
    nodeEnv: string;
    apiUrl: string;
    appUrl: string;
  };
  versions: {
    backend: string;
    frontend?: string;
    commitSha?: string;
    buildDate?: string;
  };
  featureFlags: Array<{ key: string; label: string; enabled: boolean }>;
}

export interface AdminSystemActor {
  id: string;
  name?: string;
  email?: string;
}

export interface AdminSystemApiKeyItem {
  id: string;
  name: string;
  description?: string;
  prefix: string;
  scopes: string[];
  status: SystemApiKeyStatus;
  rateLimitPerDay?: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  owner?: AdminSystemActor;
}

export interface AdminSystemImportJobItem {
  id: string;
  label: string;
  entity: SystemImportEntity;
  format: SystemDataJobFormat;
  status: SystemDataJobStatus;
  processedCount: number;
  totalCount?: number;
  sourceFilename?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdBy?: AdminSystemActor;
}

export interface AdminSystemExportJobItem {
  id: string;
  label: string;
  type: SystemExportType;
  format: SystemDataJobFormat;
  status: SystemDataJobStatus;
  recordCount?: number;
  fileUrl?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  requestedBy?: AdminSystemActor;
}

export interface AdminWebhookLogItem {
  id: string;
  provider: string;
  status: WebhookDeliveryStatus;
  eventId?: string;
  eventType?: string;
  resourceId?: string;
  receivedAt: string;
  processedAt?: string;
  latencyMs?: number;
  errorMessage?: string;
  booking?: {
    id: string;
    service: string;
    city?: string | null;
    postalCode?: string | null;
  };
  payment?: {
    id: string;
    status: PaymentStatus;
    amountCents: number;
    currency: string;
  };
  providerProfile?: {
    id: string;
    name?: string | null;
  };
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
}

export interface AdminWebhookLogDetail extends AdminWebhookLogItem {
  headers?: Record<string, unknown>;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AdminPromoCodeStatsResponse {
  promoCode: AdminPromoCodeDetail;
  stats: {
    totalUsages: number;
    totalDiscountCents: number;
    uniqueClients: number;
  };
  timeline: Array<{ date: string; usages: number; discountCents: number }>;
  services: Array<{ service: string; usages: number }>;
}

export interface AdminNotificationLogUser {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
}

export interface AdminNotificationLogBooking {
  id: string;
  service: string;
  city: string | null;
  postalCode: string | null;
  startAt: string | null;
  status: BookingStatus;
}

export interface AdminNotificationLogItem {
  id: string;
  createdAt: string;
  type: NotificationType;
  channel: NotificationChannel;
  deliveryStatus: NotificationDeliveryStatus;
  templateKey: string | null;
  payload: Record<string, unknown>;
  booking: AdminNotificationLogBooking | null;
  user: AdminNotificationLogUser | null;
  provider: { id: string; name: string | null; email: string | null } | null;
  contextClientId: string | null;
  error: { code: string; message: string | null } | null;
}

export interface AdminNotificationTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: NotificationTemplateStatus;
  supportedChannels: NotificationChannel[];
  activeChannels: NotificationChannel[];
  locales: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNotificationAutomationRule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  event: NotificationAutomationEvent;
  audience: NotificationAutomationAudience;
  channels: NotificationChannel[];
  delaySeconds: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  template: { id: string; key: string; name: string } | null;
  conditions: Record<string, unknown>;
}

export interface AdminQualityReviewListItem {
  id: string;
  score: number;
  comment: string | null;
  status: ReviewStatus;
  ecoCompliance: boolean;
  createdAt: string;
  booking: {
    id: string;
    service: string;
    city: string | null;
    postalCode: string | null;
    startAt: string;
    status: BookingStatus;
  };
  author: { id: string; name: string; email: string };
  provider: { id: string; name: string; email: string; city: string | null };
}

export interface AdminQualityReviewDetail extends AdminQualityReviewListItem {
  moderationNotes: string | null;
  moderatedAt: string | null;
}

export interface AdminQualityOverviewResponse {
  stats: {
    globalAverage: number | null;
    reviewCount: number;
    reviewCountLast7: number;
    reviewCountLast30: number;
    openIncidents: number;
  };
  serviceBreakdown: Array<{ service: string; average: number | null; count: number }>;
  cityBreakdown: Array<{ city: string; average: number | null; count: number }>;
  topProviders: Array<{
    id: string;
    name: string;
    email: string;
    city: string | null;
    ratingAverage: number | null;
    ratingCount: number;
  }>;
  atRiskProviders: Array<{
    id: string;
    name: string;
    email: string;
    city: string | null;
    ratingAverage: number | null;
    ratingCount: number;
  }>;
  recentReviews: AdminQualityReviewListItem[];
}

export interface AdminQualityProviderListItem {
  id: string;
  name: string;
  email: string;
  city: string | null;
  serviceCategories: ServiceCategory[];
  ratingAverage: number | null;
  ratingCount: number;
  totalReviews: number;
  reviewsLast30Days: number;
  bookingsLast30Days: number;
  incidentsOpen: number;
}

export interface AdminQualityIncidentItem {
  id: string;
  booking: {
    id: string;
    service: string;
    city: string | null;
    startAt: string;
  };
  status: 'open' | 'under_review' | 'action_required' | 'refunded' | 'resolved' | 'rejected';
  severity: 'low' | 'medium' | 'high';
  reason: string;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string; email: string } | null;
  provider: { id: string; name: string; email: string } | null;
  refundAmountCents: number | null;
  currency: string;
  resolution: string | null;
  adminNotes: string | null;
}

export interface AdminQualityAlert {
  id: string;
  type: 'provider_low_score' | 'critical_review' | 'client_risk';
  title: string;
  description: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AdminQualityAlertsResponse {
  alerts: AdminQualityAlert[];
  thresholds: {
    providerLowScore: number;
    providerMinReviews: number;
    criticalReviewScore: number;
    clientDisputeThreshold: number;
  };
}

export interface AdminQualitySatisfactionPoint {
  period: string;
  averageScore: number | null;
  reviewCount: number;
}

export interface AdminQualitySatisfactionResponse {
  stats: {
    averageScore: number | null;
    totalReviews: number;
    promoterRate: number;
    detractorRate: number;
    nps: number | null;
  };
  timeseries: AdminQualitySatisfactionPoint[];
  serviceBreakdown: Array<{ service: string; averageScore: number | null; reviewCount: number }>;
  cityBreakdown: Array<{ city: string; averageScore: number | null; reviewCount: number }>;
  recentReviews: AdminQualityReviewListItem[];
}

export interface AdminQualityProgramProviderItem extends AdminQualityProviderListItem {
  trend: 'up' | 'flat' | 'down';
  flags: string[];
  lastReviewAt: string | null;
}

export interface AdminQualityProgramResponse {
  summary: {
    totalProviders: number;
    atRiskCount: number;
    topCount: number;
    incidentsLast30Days: number;
  };
  atRiskProviders: AdminQualityProgramProviderItem[];
  topProviders: AdminQualityProgramProviderItem[];
}

export interface AdminQualityProviderDetail {
  profile: AdminQualityProgramProviderItem;
  stats: {
    averageScore: number | null;
    totalReviews: number;
    reviewsLast90Days: number;
    incidentsOpen: number;
    incidentsLast90Days: number;
  };
  recentReviews: AdminQualityReviewListItem[];
  recentIncidents: AdminQualityIncidentItem[];
}

export interface AdminServiceCatalogItem {
  id: ServiceCategory;
  title: string;
  description: string;
  includedOptions: string[];
  providerCount: number;
  activeProviderCount: number;
  avgHourlyRateCents: number | null;
  minHourlyRateCents: number | null;
  maxHourlyRateCents: number | null;
  bookingsCount: number;
  lastBookingAt: string | null;
  active: boolean;
}

export interface AdminServiceCatalogResponse {
  summary: {
    totalServices: number;
    servicesWithProviders: number;
    totalProviders: number;
    totalBookings: number;
    averageHourlyRateCents: number | null;
  };
  services: AdminServiceCatalogItem[];
}

export interface AdminServiceOptionItem {
  id: string;
  serviceId: ServiceCategory;
  label: string;
  description?: string | null;
  priceImpactType: 'included' | 'surcharge' | 'discount';
  active: boolean;
}

export interface AdminServiceOptionsResponse {
  summary: {
    totalOptions: number;
    servicesCovered: number;
  };
  options: AdminServiceOptionItem[];
}

export interface AdminServicePricingMatrixRow {
  serviceId: ServiceCategory;
  serviceName: string;
  providerCount: number;
  activeProviderCount: number;
  avgHourlyRateCents: number | null;
  minHourlyRateCents: number | null;
  maxHourlyRateCents: number | null;
  avgDurationHours: number | null;
  bookingsCount: number;
  lastUpdatedAt: string | null;
}

export interface AdminServicePricingMatrixResponse {
  rows: AdminServicePricingMatrixRow[];
}

export interface AdminServicePricingRuleItem {
  id: string;
  code: string;
  type: string;
  audience: string;
  description?: string | null;
  amountCents?: number | null;
  percentageBps?: number | null;
  multiplier?: number | null;
  minSquareMeters?: number | null;
  maxSquareMeters?: number | null;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminServicePricingRulesResponse {
  rules: AdminServicePricingRuleItem[];
}

export interface AdminServiceHabilitationRecord {
  providerId: string;
  providerName: string;
  providerEmail: string;
  serviceId: ServiceCategory;
  serviceName: string;
  onboardingStatus: string | null;
  identityStatus: string | null;
  payoutStatus: string | null;
  payoutReady: boolean;
  ratingAverage: number | null;
  ratingCount: number | null;
  missionsCompleted: number;
  lastMissionAt: string | null;
  documents: DocumentReference[];
}

export interface AdminServiceHabilitationsResponse {
  summary: {
    totalProviders: number;
    verifiedProviders: number;
    payoutReadyProviders: number;
    servicesCovered: number;
  };
  items: AdminServiceHabilitationRecord[];
}

export type AdminServiceLogCategory = 'pricing' | 'service' | 'document';

export interface AdminServiceLogItem {
  id: string;
  timestamp: string;
  category: AdminServiceLogCategory;
  actor: string;
  message: string;
}

export interface AdminServiceLogsResponse {
  logs: AdminServiceLogItem[];
}

export interface AdminServicePreviewParams {
  service: ServiceCategory;
  postalCode: string;
  hours: number;
  ecoPreference?: EcoPreference;
}

export interface AdminServicePreviewResponse {
  service: ServiceCategory;
  postalCode: string;
  hours: number;
  ecoPreference: EcoPreference;
  estimate: PriceEstimate;
}

export interface AdminPostalZoneRecord {
  postalCode: string;
  city: string;
  area?: string | null;
  state?: string | null;
  countryCode?: string | null;
  active: boolean;
  notes?: string | null;
}

export interface AdminPostalZonesResponse {
  summary: {
    totalZones: number;
    filteredZones: number;
  };
  items: AdminPostalZoneRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export type ZoneCoverageStatus = 'none' | 'low' | 'balanced' | 'surplus';

export interface AdminZoneCoverageRecord {
  postalCode: string;
  city: string;
  providerCount: number;
  bookingsLast30Days: number;
  ratio: number;
  status: ZoneCoverageStatus;
}

export interface AdminZoneCoverageResponse {
  generatedAt: string;
  items: AdminZoneCoverageRecord[];
}

export interface AdminProviderServiceAreaZone {
  id: string;
  name: string;
  postalCode?: string | null;
  city?: string | null;
  district?: string | null;
}

export interface AdminProviderServiceAreaRecord {
  providerId: string;
  providerName: string;
  providerEmail: string;
  basePostalCode?: string | null;
  baseCity?: string | null;
  serviceAreas: string[];
  serviceCategories: ServiceCategory[];
  serviceZones: AdminProviderServiceAreaZone[];
  updatedAt: string;
}

export interface AdminProviderServiceAreasResponse {
  items: AdminProviderServiceAreaRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminZoneMatchingRulesResponse {
  defaults: {
    distanceMaxKm: number;
    weights: Record<string, number>;
    teamBonus: {
      two?: number;
      threePlus?: number;
    };
  };
  overrides: Array<{
    postalCode: string;
    city?: string | null;
    notes?: string | null;
    distanceMaxKm?: number | null;
  }>;
}

export interface AdminMatchingCandidate {
  providerId: string;
  providerName: string;
  providerEmail: string;
  score: number;
  rank: number;
  components: Record<string, number>;
  metadata: {
    distanceKm: number;
    priceEstimateCents: number | null;
    ratingAverage: number | null;
    ratingCount: number | null;
    providerType: ProviderType;
    reliabilityRecent: number;
  };
  serviceAreas: string[];
  serviceZones: AdminProviderServiceAreaZone[];
}

export interface AdminMatchingTestResponse {
  query: {
    postalCode: string;
    city?: string | null;
    service: ServiceCategory;
    startAt: string;
    endAt: string;
    ecoPreference: EcoPreference;
    requiredProviders: number;
  };
  candidates: AdminMatchingCandidate[];
  summary: {
    totalCandidates: number;
    distanceMaxKm: number;
  };
}

export interface AdminSmartMatchingStats {
  period: {
    from: string;
    to: string;
  };
  totalMatches: number;
  successfulMatches: number;
  pendingMatches: number;
  successRate: number;
  avgProvidersContacted: number;
  avgFirstResponseMinutes: number | null;
  avgAssignmentMinutes: number | null;
}

export interface AdminSmartMatchingOverviewResponse {
  generatedAt: string;
  stats: AdminSmartMatchingStats;
  charts: {
    matchesByDay: Array<{ date: string; total: number; successful: number }>;
    responsesByStatus: Array<{ status: BookingInvitationStatus | 'pending'; value: number }>;
  };
  notes?: string[];
}

export interface AdminSmartMatchingScenario {
  id: string;
  name: string;
  description?: string;
  conditions: string;
  stats: {
    bookings: number;
    successRate: number;
    avgInvitations: number | null;
    avgLeadHours: number | null;
  };
  highlights: string[];
}

export interface AdminSmartMatchingScenarioResponse {
  period: {
    from: string;
    to: string;
  };
  scenarios: AdminSmartMatchingScenario[];
}

export interface AdminSmartMatchingInvitationSummary {
  total: number;
  accepted: number;
  declined: number;
  expired: number;
  pending: number;
}

export interface AdminSmartMatchingHistoryItem {
  bookingId: string;
  createdAt: string;
  startAt: string;
  service: ServiceCategory;
  city: string;
  postalCode: string;
  status: BookingStatus;
  result: 'assigned' | 'unassigned';
  provider?: AdminBookingParty | null;
  invitations: AdminSmartMatchingInvitationSummary;
  requestedProviders: number;
  shortNotice: boolean;
  client: AdminBookingParty | null;
  lastInvitationAt?: string | null;
}

export type AdminSmartMatchingTimelineEventType =
  | 'invited'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'assigned';

export interface AdminSmartMatchingTimelineEvent {
  type: AdminSmartMatchingTimelineEventType;
  timestamp: string;
  provider?: AdminBookingParty;
  notes?: string;
}

export interface AdminSmartMatchingInvitationDetail {
  id: string;
  status: BookingInvitationStatus;
  invitedAt: string;
  viewedAt?: string | null;
  respondedAt?: string | null;
  provider: AdminBookingParty;
  metadata?: Record<string, unknown> | null;
}

export interface AdminSmartMatchingDetail {
  booking: AdminBookingListItem;
  summary: {
    invitations: AdminSmartMatchingInvitationSummary;
    assignedProvider?: AdminBookingParty | null;
    firstInvitationAt?: string | null;
    firstResponseAt?: string | null;
    assignmentAt?: string | null;
  };
  invitations: AdminSmartMatchingInvitationDetail[];
  timeline: AdminSmartMatchingTimelineEvent[];
}

export interface AdminSmartMatchingConfig {
  distanceMaxKm: number;
  weights: Record<string, number>;
  teamBonus: {
    two?: number;
    threePlus?: number;
  };
}

export interface AdminSmartMatchingPolicy {
  id: string;
  name: string;
  description?: string;
  type: 'priority' | 'limit' | 'monitoring';
  scope: string;
  enabled: boolean;
  stats: {
    impactedBookings: number;
    complianceRate?: number | null;
    breaches?: number;
  };
  highlights: string[];
}

export interface AdminSmartMatchingPolicyResponse {
  period: {
    from: string;
    to: string;
  };
  policies: AdminSmartMatchingPolicy[];
}

export interface AdminSmartMatchingGuardrailCase {
  id: string;
  reference: string;
  count: number;
  lastEventAt: string;
  extra?: string | null;
}

export interface AdminSmartMatchingGuardrail {
  id: string;
  name: string;
  target: 'provider' | 'client';
  description: string;
  threshold: string;
  activeCases: number;
  criticalCases?: number;
  examples: AdminSmartMatchingGuardrailCase[];
}

export interface AdminSmartMatchingGuardrailResponse {
  period: {
    from: string;
    to: string;
  };
  guardrails: AdminSmartMatchingGuardrail[];
}

export interface AdminSmartMatchingSimulationResponse {
  query: {
    postalCode: string;
    city?: string | null;
    service: ServiceCategory;
    startAt: string;
    endAt: string;
    ecoPreference: EcoPreference;
    requiredProviders: number;
  };
  candidates: AdminMatchingCandidate[];
  summary: {
    totalCandidates: number;
    generatedAt: string;
  };
}

export interface AdminSupportItem {
  id: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'new' | 'assigned' | 'waiting_client' | 'resolved';
  updatedAt: string;
  assignee?: string;
  requester: string;
  channel: 'app' | 'email' | 'phone';
}

export interface AdminTicket {
  id: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  status: 'triage' | 'investigating' | 'mitigated' | 'resolved';
  owner: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface AdminSupportUserRef {
  id: string;
  name: string;
  email: string;
  type: 'client' | 'provider' | 'company' | 'employee';
}

export interface AdminSupportBookingRef {
  id: string;
  status: BookingStatus;
  service: string;
  startAt: string;
  city?: string | null;
  postalCode?: string | null;
  totalCents?: number | null;
  currency?: string | null;
  clientName?: string | null;
  providerName?: string | null;
}

export interface AdminSupportTicketListItem {
  id: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'onboarding' | 'billing' | 'incident' | 'feature_request' | 'other';
  requester: AdminSupportUserRef;
  assignee?: AdminSupportUserRef;
  booking?: AdminSupportBookingRef;
  channel: 'app' | 'email' | 'phone' | 'chat';
  updatedAt: string;
  createdAt: string;
  dueAt?: string | null;
  messageCount: number;
}

export interface AdminSupportTicketListResponse extends AdminPaginatedResponse<AdminSupportTicketListItem> {}

export interface AdminSupportMessageAttachment {
  id: string;
  url: string;
  filename: string;
}

export interface AdminSupportMessage {
  id: string;
  createdAt: string;
  content: string;
  internal: boolean;
  author?: AdminSupportUserRef;
  attachments?: AdminSupportMessageAttachment[];
}

export interface AdminSupportTicketDetail {
  ticket: AdminSupportTicketListItem;
  messages: AdminSupportMessage[];
}

export interface AdminSupportDisputeListItem {
  id: string;
  status: 'open' | 'under_review' | 'action_required' | 'refunded' | 'resolved' | 'rejected';
  reason: string;
  openedAt: string;
  updatedAt: string;
  booking?: AdminSupportBookingRef;
  paymentAmountCents?: number | null;
  paymentCurrency?: string | null;
  refundAmountCents?: number | null;
  refundCurrency?: string | null;
  resolution?: string | null;
}

export interface AdminSupportDisputeListResponse extends AdminPaginatedResponse<AdminSupportDisputeListItem> {}

export interface AdminSupportDisputeDetail extends AdminSupportDisputeListItem {
  description?: string | null;
  adminNotes?: string | null;
  assignedTo?: AdminSupportUserRef;
  messages: Array<{
    id: string;
    createdAt: string;
    role: 'client' | 'provider' | 'admin';
    message: string;
    author?: AdminSupportUserRef;
  }>;
}

export interface AdminSupportOverviewResponse {
  metrics: {
    openTickets: number;
    urgentTickets: number;
    activeDisputes: number;
    resolution24hRate: number;
  };
  timeline: Array<{ date: string; tickets: number; disputes: number }>;
  disputeReasons: Array<{ reason: string; value: number }>;
  recentTickets: Array<{
    id: string;
    subject: string;
    priority: AdminSupportTicketListItem['priority'];
    status: AdminSupportTicketListItem['status'];
    requester: string;
    assignee?: string;
    updatedAt: string;
  }>;
}

export interface AdminSupportSlaResponse {
  averageFirstResponseMinutes: number | null;
  averageResolutionHours: number | null;
  resolution24hRate: number | null;
  satisfactionScore: number | null;
  feedbackSampleSize: number;
  responseTrend: Array<{ label: string; value: number }>;
  volumeByDay: Array<{ label: string; value: number }>;
}

export interface AdminSupportRangeQuery {
  from?: string;
  to?: string;
}

export interface AdminSupportTicketsQuery extends AdminSupportRangeQuery {
  status?: AdminSupportTicketListItem['status'];
  priority?: AdminSupportTicketListItem['priority'];
  category?: AdminSupportTicketListItem['category'];
  type?: 'client' | 'provider' | 'company' | 'employee';
  search?: string;
  bookingId?: string;
  requesterId?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminSupportDisputesQuery extends AdminSupportRangeQuery {
  status?: AdminSupportDisputeListItem['status'];
  bookingId?: string;
  clientId?: string;
  providerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminSupportTicketUpdatePayload {
  status?: AdminSupportTicketListItem['status'];
  priority?: AdminSupportTicketListItem['priority'];
  assigneeId?: string | null;
  dueAt?: string | null;
}

export interface AdminSupportTicketMessagePayload {
  content: string;
  internal?: boolean;
}

export interface AdminSupportDisputeUpdatePayload {
  status?: AdminSupportDisputeListItem['status'];
  resolution?: string | null;
  refundAmountCents?: number | null;
  refundCurrency?: string | null;
  assignedToId?: string | null;
  adminNotes?: string | null;
}

export interface OpsFallbackQueueItem {
  bookingId: string;
  status: BookingStatus;
  service: ServiceCategory;
  startAt: string;
  endAt: string;
  city?: string;
  requiredProviders: number;
  matchingRetryCount: number;
  fallbackRequestedAt?: string | null;
  fallbackEscalatedAt?: string | null;
  teamCandidate?: FallbackTeamCandidate | null;
}

export interface BookingLockSummary {
  id: string;
  bookingId: string;
  providerId?: string | null;
  providerTeamId?: string | null;
  providerDisplayName?: string;
  providerTeamName?: string;
  lockedCount: number;
  status: 'HELD' | 'CONFIRMED' | 'RELEASED';
  createdAt: string;
  expiresAt: string;
  slotStartAt?: string | null;
  slotEndAt?: string | null;
}

export interface BookingLockUpdatePayload {
  lockIds?: string[];
}

export interface AdminOperationsMetrics {
  metrics: Array<{
    id: string;
    label: string;
    value: string;
    trend: number;
  }>;
  services: Array<{
    id: string;
    name: string;
    status: 'operational' | 'degraded' | 'partial_outage';
    latencyMs: number;
    lastIncidentAt?: string;
  }>;
  incidents: Array<{
    id: string;
    title: string;
    severity: 'minor' | 'major' | 'critical';
    detectedAt: string;
    status: 'open' | 'monitoring' | 'resolved';
    owner: string;
  }>;
  analytics: Array<{
    id: string;
    label: string;
    value: number;
    unit: string;
  }>;
  fallbackQueue: OpsFallbackQueueItem[];
}

export interface PaymentEventRecord {
  id: string;
  createdAt: string;
  paymentId?: string;
  provider: 'STRIPE' | 'MOLLIE' | 'ADYEN' | 'OTHER';
  type: string;
  payload: Record<string, unknown>;
}

export interface UpdateAdminUserPayload {
  role?: UserRole;
  status?: 'active' | 'invited' | 'suspended';
}

export interface UpdateAdminEmployeeRolePayload {
  role: UserRole;
  reason?: string | null;
}

export interface UpdateProviderOnboardingStatusPayload {
  status: 'approved' | 'rejected';
  reviewer?: string;
}

export interface AdminDashboardMetrics {
  activeProviders: number;
  pendingBookings: number;
  satisfaction: number;
  revenue: number;
}

export interface AdminDashboardUserOverview {
  total: number;
  providers: {
    total: number;
    active: number;
    inactive: number;
  };
  clients: number;
  employees: number;
  admins: number;
}

export interface AdminDashboardBookingsOverview {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  statuses: {
    draft: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    completed: number;
  };
  shortNotice: {
    total: number;
    percentage: number;
  };
  cancellationRate: number;
  conversionRate: number;
}

export interface AdminDashboardFinancesOverview {
  revenue: {
    today: number;
    week: number;
    month: number;
  };
  payments: {
    succeeded: number;
    pending: number;
    failed: number;
    refunded: number;
  };
  averageBasket: number;
}

export interface AdminDashboardChartPoint {
  date: string;
  value: number;
  label?: string;
}

export interface AdminDashboardOverview {
  users: AdminDashboardUserOverview;
  bookings: AdminDashboardBookingsOverview;
  finances: AdminDashboardFinancesOverview;
  charts: {
    bookingsPerDay: AdminDashboardChartPoint[];
    revenuePerWeek: AdminDashboardChartPoint[];
  };
  operations: {
    occupancyRate: number;
    busyProviders: number;
    shortNoticeRatio: number;
  };
}

export type AdminDashboardAlertTone = 'neutral' | 'accent' | 'positive';

export interface AdminDashboardAlert {
  id: string;
  label: string;
  description: string;
  icon?: string;
  tone?: AdminDashboardAlertTone;
}

export interface AdminDashboardPerformance {
  matching: number;
  onTime: number;
  supportSlaHours: number;
}

export interface AdminDashboardTopProvider {
  id: string;
  name: string;
  rating: number;
  missions: number;
}

export interface AdminDashboardEscalation {
  id: string;
  subject: string;
  helper?: string;
  status: string;
  priority?: string;
}

export interface AdminDashboardResponse {
  metrics: AdminDashboardMetrics;
  alerts: AdminDashboardAlert[];
  performance: AdminDashboardPerformance;
  topProviders: AdminDashboardTopProvider[];
  escalations: AdminDashboardEscalation[];
  overview?: AdminDashboardOverview;
}

export interface CreateDisputePayload {
  bookingId: string;
  reason: string;
  description?: string;
  initialMessage?: string;
}

export interface DisputeMessagePayload {
  message: string;
}

export interface AdminAssignDisputePayload {
  assigneeId?: string;
}

export interface AdminUpdateDisputePayload {
  status: DisputeStatus;
  resolution?: string;
  refundAmountCents?: number;
  refundCurrency?: string;
  adminNotes?: string;
}

export interface DisputeResponse {
  dispute: DisputeRecord;
}

export interface DisputeListResponse {
  items: DisputeRecord[];
}
