import type {
  Address,
  AddressSuggestion,
  BookingContactDetails,
  BookingMode,
  BookingRequest,
  BookingServicePreferences,
  BookingStatus,
  CleaningFrequency,
  EcoPreference,
  FallbackTeamCandidate,
  NotificationChannel,
  NotificationType,
  ProfileAuditEntry,
  ProfileSummary,
  ProviderProfile,
  ProviderServiceType,
  ProviderServiceZone,
  ServiceCategory,
  SupportCategory,
  SupportPriority,
  SupportStatus,
  User,
  UserPreferences,
  UserRole,
  DisputeRecord,
  DisputeStatus,
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
  mode?: BookingMode;
  fallbackRequested?: boolean;
  fallbackEscalated?: boolean;
  minRetryCount?: number;
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

export type ProviderIdentityDocumentType = 'passport' | 'id_card' | 'residence_permit';

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

export interface ProviderIdentityDocumentUploadPayload {
  documentType: ProviderIdentityDocumentType;
  side?: ProviderIdentityDocumentSide;
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
