export type UserRole =
  | 'client'
  | 'provider'
  | 'company'
  | 'employee'
  | 'admin';

export type CleaningFrequency =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'contract'
  | 'last_minute';

export type ServiceCategory =
  | 'residential'
  | 'office'
  | 'industrial'
  | 'windows'
  | 'disinfection'
  | 'eco_plus'
  | 'carpet'
  | 'upholstery'
  | 'spring'
  | 'final'
  | 'cluttered'
  | 'construction'
  | 'move_out'
  | 'pigeon_cleanup'
  | 'restaurant'
  | 'heavy_dirty'
  | 'carpet_laundry'
  | 'wintergarden'
  | 'nicotine_removal'
  | 'fire_damage'
  | 'clearout'
  | 'wood_terrace'
  | 'water_damage'
  | 'hoarder'
  | 'deep_disinfection';

export interface ProviderServiceType {
  id: ServiceCategory;
  title: string;
  description: string;
  includedOptions: string[];
}

export type BookingMode = 'manual' | 'smart_match';

export type EcoPreference = 'standard' | 'bio';

export type CleaningSoilLevel = 'light' | 'normal' | 'strong' | 'extreme';

export interface BookingContactDetails {
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  address?: Address;
}

export interface BookingServicePreferences {
  soilLevel?: CleaningSoilLevel;
  wishes?: string[];
  upholstery?: {
    quantities?: Record<string, number>;
    addons?: string[];
  };
  additionalInstructions?: string;
}

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export interface Address {
  streetLine1: string;
  streetLine2?: string;
  postalCode: string;
  city: string;
  countryCode: string;
  coordinates?: GeoLocation;
  accessNotes?: string;
}

export interface User extends BaseEntity {
  email: string;
  phone?: string;
  passwordHash?: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  preferredLocale: string;
  isActive: boolean;
  lastLoginAt?: string;
  companies?: string[]; // company ids for which the user has access
}

export interface EmployeeProfile extends BaseEntity {
  userId: string;
  companyId: string;
  role: 'manager' | 'operator' | 'viewer';
  permissions: string[];
}

export interface ProviderProfile extends BaseEntity {
  userId: string;
  type: 'freelancer' | 'company';
  languages: string[];
  serviceAreas: string[];
  serviceZones?: ProviderServiceZone[];
  serviceCategories: ServiceCategory[];
  hourlyRateCents: number;
  bio?: string;
  yearsExperience?: number;
  ratingAverage?: number;
  ratingCount?: number;
  offersEco: boolean;
  acceptsAnimals?: boolean;
  payoutMethod?: 'card' | 'bank_transfer';
  payoutLast4?: string;
  payoutReady: boolean;
  kycStatus?: string;
  gender?: string;
  birthDate?: string;
  birthCity?: string;
  birthCountry?: string;
  nationality?: string;
  termsAcceptedAt?: string;
  address?: {
    streetLine1: string;
    streetLine2?: string;
    postalCode: string;
    city: string;
    region?: string;
  };
  onboardingStatus?: string;
  identityCompletedAt?: string;
  addressCompletedAt?: string;
  profileCompletedAt?: string;
  pricingCompletedAt?: string;
  phoneVerifiedAt?: string;
  identityVerifiedAt?: string;
  identityVerificationStatus?: 'not_started' | 'submitted' | 'verified' | 'rejected';
  identityVerificationReviewer?: string;
  identityVerificationReviewedAt?: string;
  identityVerificationNotes?: string;
  onfidoApplicantId?: string;
  onfidoWorkflowRunId?: string;
  onfidoCheckId?: string;
  onfidoReportIds?: string[];
  signupFeePaidAt?: string;
  welcomeSessionCompletedAt?: string;
  documents: DocumentReference[];
}

export interface ProviderServiceZone {
  id: string;
  name: string;
  postalCode?: string;
  city?: string;
  district?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}

export interface Company extends BaseEntity {
  name: string;
  vatNumber?: string;
  legalForm?: string;
  billingEmail: string;
  phone?: string;
  address: Address;
  locales: string[];
  ecoPolicy?: string;
}

export interface ClientProfile extends BaseEntity {
  userId: string;
  defaultLocale: string;
  savedAddresses: Address[];
  favouriteProviderIds: string[];
  loyaltyPoints?: number;
  externalCustomerId?: string;
  defaultPaymentMethodId?: string;
}

export interface CleaningServiceOption {
  id: ServiceCategory;
  title: string;
  description: string;
  ecoCompatible: boolean;
  recommendedProviderCount: number;
}

export interface PricingTier {
  id: string;
  name: string;
  audience: string;
  basePriceCents: number | 'custom';
  currency: 'EUR';
  includesEco: boolean;
  notes?: string;
}

export interface BookingPreview {
  service: ServiceCategory;
  squareMeters: number;
  preferredMode: BookingMode;
  frequency: CleaningFrequency;
  ecoPreference: EcoPreference;
  providerCount: number;
}

export interface BookingRequest extends BaseEntity {
  clientId: string | null;
  companyId?: string;
  address: Address;
  service: ServiceCategory;
  billingAddress?: Address;
  contact?: BookingContactDetails;
  onsiteContact?: BookingContactDetails;
  surfacesSquareMeters?: number | null;
  durationHours?: number | null;
  recommendedHours?: number | null;
  durationManuallyAdjusted?: boolean;
  startAt: string;
  endAt: string;
  frequency: CleaningFrequency;
  mode: BookingMode;
  ecoPreference: EcoPreference;
  requiredProviders: number;
  preferredTeamId?: string;
  assignedTeamId?: string;
  providerIds: string[];
  attachments: DocumentReference[];
  notes?: string;
  opsNotes?: string;
  providerNotes?: string;
  reminderAt?: string | null;
  reminderNotes?: string;
  status: BookingStatus;
  pricing: BookingPricing;
  auditLog: BookingAuditEntry[];
  matchingRetryCount: number;
  fallbackRequestedAt?: string | null;
  fallbackEscalatedAt?: string | null;
  fallbackTeamCandidate?: FallbackTeamCandidate | null;
  leadTimeDays?: number;
  shortNotice?: boolean;
  shortNoticeDepositCents?: number;
  couponCode?: string | null;
  servicePreferences?: BookingServicePreferences;
}

export type BookingInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface ProviderBookingInvitation {
  id: string;
  bookingId: string;
  status: BookingInvitationStatus;
  createdAt: string;
  respondedAt?: string | null;
  service: ServiceCategory;
  city: string;
  postalCode: string;
  startAt: string;
  endAt: string;
  durationHours: number;
  ecoPreference: EcoPreference;
  surfacesSquareMeters?: number | null;
  requiredProviders: number;
  shortNoticeDepositCents?: number;
}

export interface BookingCreationResponse extends BookingRequest {
  paymentIntentClientSecret?: string;
  setupIntentClientSecret?: string;
  checkoutUrl?: string | null;
}

export type BookingStatus =
  | 'draft'
  | 'pending_provider'
  | 'pending_client'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface BookingPricing {
  subtotalCents: number;
  ecoSurchargeCents: number;
  loyaltyCreditsCents: number;
  extrasCents: number;
  taxCents: number;
  currency: 'EUR';
  totalCents: number;
}

export interface FallbackTeamCandidate {
  id: string;
  name: string;
  preferredSize?: number;
  memberCount: number;
}

export interface ProviderTeam extends BaseEntity {
  ownerId: string;
  name: string;
  description?: string;
  serviceCategories: ServiceCategory[];
  preferredSize?: number;
  isActive: boolean;
  notes?: string;
  defaultDailyCapacity?: number;
  timezone?: string;
  members: ProviderTeamMember[];
  fallbackQueue?: ProviderTeamFallbackMission[];
}

export interface ProviderTeamMember extends BaseEntity {
  teamId: string;
  providerId: string;
  role?: string;
  isLead: boolean;
  orderIndex: number;
}

export interface ProviderTeamFallbackMission {
  bookingId: string;
  startAt: string;
  city?: string;
  requiredProviders: number;
  requestedAt?: string | null;
}

export interface ProviderTeamMemberSchedule {
  providerId: string;
  displayName: string;
  role?: string;
  isLead: boolean;
  timezone: string;
  weeklyHours: number;
  availability: Array<{
    weekday: number;
    startMinutes: number;
    endMinutes: number;
    isActive: boolean;
  }>;
  timeOff: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: 'past' | 'active' | 'upcoming';
    reason?: string;
  }>;
  blockingAssignments: number;
}

export interface ProviderTeamSchedule {
  teamId: string;
  teamName: string;
  timezone: string;
  totalMembers: number;
  activeMembers: number;
  weeklyCapacityHours: number;
  members: ProviderTeamMemberSchedule[];
}

export interface TeamPlanSlotSummary {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  booked: number;
}

export interface ProviderTeamPlanDay {
  id: string;
  date: string;
  capacitySlots: number;
  capacityBooked: number;
  slots: TeamPlanSlotSummary[];
}

export interface ProviderTeamPlan {
  teamId: string;
  teamName: string;
  timezone: string;
  days: ProviderTeamPlanDay[];
}

export interface BookingAuditEntry {
  timestamp: string;
  actorId: string;
  action:
    | 'created'
    | 'updated'
    | 'provider_assigned'
    | 'provider_removed'
    | 'status_changed'
    | 'note_updated'
    | 'reminder_scheduled'
    | 'attachment_uploaded'
    | 'customer_notified'
    | 'invoice_generated'
    | 'payment_captured';
  metadata?: Record<string, unknown>;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  district?: string;
  latitude: number | null;
  longitude: number | null;
}

export interface PaymentRecord extends BaseEntity {
  bookingId: string;
  clientId: string;
  amountCents: number;
  currency: 'EUR';
  providerDistributions: PaymentDistribution[];
  platformFeeCents: number;
  status: PaymentStatus;
  method?: PaymentMethod | null;
  provider?: 'mollie' | 'adyen' | 'other';
  externalReference?: string;
  externalCustomerId?: string;
  externalPaymentIntentId?: string;
  externalPaymentMethodId?: string;
  externalSetupIntentId?: string;
  externalMandateId?: string;
  paymentMethodSnapshot?: Record<string, unknown> | null;
  billingName?: string | null;
  billingEmail?: string | null;
  authorizedAt?: string | null;
  capturedAt?: string | null;
  releasedAt?: string | null;
  refundedAt?: string | null;
  cancellationReason?: string;
  occurredAt: string;
}

export interface PaymentMandateRecord extends BaseEntity {
  provider: 'mollie' | 'adyen' | 'other';
  externalMandateId: string;
  externalPaymentMethodId?: string;
  method?: PaymentMethod | null;
  status: string;
  reference?: string | null;
  scheme?: string | null;
  bankCountry?: string | null;
  bankCode?: string | null;
  last4?: string | null;
  fingerprint?: string | null;
  url?: string | null;
  usage?: string | null;
  acceptedAt?: string | null;
  customerIp?: string | null;
  customerUserAgent?: string | null;
  lastSyncedAt?: string | null;
  revokedAt?: string | null;
}

export interface PaymentDistribution {
  beneficiaryId: string;
  amountCents: number;
  beneficiaryType: 'provider' | 'company';
  currency: 'EUR';
  payoutStatus: 'pending' | 'processing' | 'paid' | 'failed';
  externalReference?: string;
  availableOn?: string | null;
  releasedAt?: string | null;
}

export type PaymentStatus =
  | 'pending'
  | 'requires_action'
  | 'authorized'
  | 'capture_pending'
  | 'captured'
  | 'held'
  | 'released'
  | 'refunded'
  | 'failed'
  | 'disputed';
export type PaymentMethod = 'card' | 'sepa' | 'paypal';

export interface Review extends BaseEntity {
  bookingId: string;
  authorId: string;
  targetProviderId: string;
  score: number; // 0-10
  comment?: string;
  ecoCompliance: boolean;
}

export interface DocumentReference {
  id: string;
  type: DocumentType;
  url: string;
  uploadedAt: string;
  name?: string;
  metadata?: Record<string, unknown>;
  reviewStatus?: DocumentReviewStatus;
  reviewNotes?: string;
  reviewedAt?: string;
  reviewerId?: string;
}

export type DocumentType =
  | 'identity'
  | 'insurance'
  | 'tax'
  | 'contract'
  | 'checklist'
  | 'photo_before'
  | 'photo_after'
  | 'invoice'
  | 'other';

export type DocumentReviewStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export type SupportStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_customer'
  | 'resolved'
  | 'closed';

export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SupportCategory =
  | 'onboarding'
  | 'billing'
  | 'incident'
  | 'feature_request'
  | 'other';

export interface SupportTicket extends BaseEntity {
  subject: string;
  description: string;
  status: SupportStatus;
  priority: SupportPriority;
  category: SupportCategory;
  requesterId: string;
  assigneeId?: string | null;
  dueAt?: string | null;
  messages?: SupportMessage[];
  attachments?: SupportAttachment[];
  requester?: SupportProfile;
  assignee?: SupportProfile | null;
}

export interface SupportMessage extends BaseEntity {
  ticketId: string;
  authorId: string;
  content: string;
  internal: boolean;
  attachments: SupportAttachment[];
  author?: SupportProfile;
}

export interface SupportAttachment extends BaseEntity {
  messageId: string;
  url: string;
  filename: string;
}

export interface SupportProfile {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

export type NotificationType =
  | 'booking_status'
  | 'booking_assignment'
  | 'booking_cancellation'
  | 'billing'
  | 'support_update'
  | 'matching_progress';

export type NotificationChannel = 'in_app' | 'email' | 'push';

export interface Notification extends BaseEntity {
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt?: string | null;
  userId: string;
}

export interface NotificationPreference extends BaseEntity {
  userId: string;
  channels: NotificationChannel[];
  language?: string | null;
  mutedTypes: NotificationType[];
}

export type AdminReviewType = 'document' | 'provider_profile' | 'booking' | 'payment';
export type AdminReviewStatus = 'pending' | 'approved' | 'rejected';

export interface AdminReview extends BaseEntity {
  type: AdminReviewType;
  status: AdminReviewStatus;
  targetId: string;
  targetLabel?: string;
  notes?: string;
  reviewerId?: string;
  metadata?: Record<string, unknown>;
  documentId?: string;
}

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'action_required'
  | 'refunded'
  | 'resolved'
  | 'rejected';

export type DisputeParticipantRole = 'client' | 'provider' | 'admin';

export interface DisputeMessage extends BaseEntity {
  disputeId: string;
  authorId?: string | null;
  role: DisputeParticipantRole;
  message: string;
  attachments?: Record<string, unknown> | null;
}

export interface DisputeRecord extends BaseEntity {
  bookingId: string;
  paymentId?: string | null;
  status: DisputeStatus;
  reason: string;
  description?: string;
  openedById?: string | null;
  assignedToId?: string | null;
  resolution?: string;
  refundAmountCents?: number | null;
  refundCurrency?: string | null;
  refundProcessedAt?: string | null;
  resolvedAt?: string | null;
  adminNotes?: string | null;
  messages?: DisputeMessage[];
}

export interface NotificationRealtimeEvent {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  createdAt: string;
  notificationId?: string;
}

export interface ProfileSummary {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  preferredLocale: string;
  roles: UserRole[];
  createdAt: string;
  updatedAt?: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  marketingEmails: boolean;
  productUpdates: boolean;
  enableDarkMode: boolean;
  digestFrequency: 'NEVER' | 'DAILY' | 'WEEKLY';
}

export interface ProfileAuditEntry extends BaseEntity {
  userId: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
}
