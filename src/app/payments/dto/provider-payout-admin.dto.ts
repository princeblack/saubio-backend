import { IsString } from 'class-validator';
import { ProviderPayoutSetupDto } from './provider-payout-setup.dto';

export class ProviderPayoutAdminDto extends ProviderPayoutSetupDto {
  @IsString()
  providerId!: string;
}
