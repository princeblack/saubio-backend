export interface ProviderOnboardingResponse {
  url?: string | null;
  expiresAt?: string | null;
  payoutReady: boolean;
  status: 'pending' | 'in_review' | 'verified' | 'rejected';
  method?: 'bank_transfer' | 'card' | null;
  last4?: string | null;
  mandateStatus?: string | null;
}
