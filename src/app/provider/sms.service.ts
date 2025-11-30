import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironmentConfig } from '../config/configuration';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly client?: Twilio;
  private readonly fromNumber?: string;
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService<AppEnvironmentConfig>) {
    const appConfig = this.configService.get<AppEnvironmentConfig>('app' as never);
    const accountSid = appConfig?.twilioAccountSid?.trim();
    const authToken = appConfig?.twilioAuthToken?.trim();
    this.fromNumber = appConfig?.twilioFromNumber?.trim();

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
    } else {
      this.logger.warn('Twilio credentials missing. SMS verification is disabled.');
      this.client = undefined;
    }
  }

  isEnabled() {
    return Boolean(this.client && this.fromNumber);
  }

  async sendVerificationCode(phoneNumber: string, code: string) {
    if (!this.client || !this.fromNumber) {
      this.logger.warn(`SMS not sent (Twilio disabled). Target: ${phoneNumber}, code: ${code}`);
      return;
    }

    await this.client.messages.create({
      to: phoneNumber,
      from: this.fromNumber,
      body: `Votre code de vérification Saubio est ${code}`,
    });
  }
}
