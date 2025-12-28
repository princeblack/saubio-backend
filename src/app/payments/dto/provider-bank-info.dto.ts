import { ProviderBankInfo } from '@saubio/models';

export class ProviderBankInfoDto implements ProviderBankInfo {
  accountHolder: string | null = null;
  ibanMasked: string | null = null;
  bankName?: string | null;
  status: 'inactive' | 'pending' | 'active' | 'failed' = 'inactive';
  last4?: string | null;
}
