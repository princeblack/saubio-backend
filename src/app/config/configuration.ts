export interface AppEnvironmentConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  databaseUrl?: string;
  jwtSecret?: string;
  jwtAccessSecret?: string;
  jwtRefreshSecret?: string;
  jwtAccessExpiresIn?: string;
  jwtRefreshExpiresIn?: string;
  appUrl?: string;
  paypalClientId?: string;
  paypalClientSecret?: string;
  emailProviderUrl?: string;
  emailProviderToken?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  enableSwagger: boolean;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  onfidoApiToken?: string;
  onfidoRegion?: 'eu' | 'us';
  onfidoWebhookToken?: string;
  onfidoWorkflowId?: string;
  mollieApiKey?: string;
  mollieWebhookToken?: string;
  googleClientId?: string;
  appleClientId?: string;
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
}

import { registerAs } from '@nestjs/config';

export default registerAs('app', (): AppEnvironmentConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppEnvironmentConfig['nodeEnv']) ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  appUrl: process.env.APP_URL ?? 'http://localhost:4200',
  paypalClientId: process.env.PAYPAL_CLIENT_ID,
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET,
  emailProviderUrl: process.env.EMAIL_PROVIDER_URL,
  emailProviderToken: process.env.EMAIL_PROVIDER_TOKEN,
  smtpHost: process.env.SMTP_HOST,
  smtpPort:
    process.env.SMTP_PORT && !Number.isNaN(Number(process.env.SMTP_PORT))
      ? Number(process.env.SMTP_PORT)
      : undefined,
  smtpSecure:
    process.env.SMTP_SECURE === undefined
      ? undefined
      : ['1', 'true', 'yes', 'on'].includes(process.env.SMTP_SECURE.toLowerCase()),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER,
  enableSwagger: process.env.ENABLE_SWAGGER !== 'false',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
  onfidoApiToken: process.env.ONFIDO_API_TOKEN,
  onfidoRegion: (process.env.ONFIDO_REGION as AppEnvironmentConfig['onfidoRegion']) ?? 'eu',
  onfidoWebhookToken: process.env.ONFIDO_WEBHOOK_TOKEN,
  onfidoWorkflowId: process.env.ONFIDO_WORKFLOW_ID,
  mollieApiKey: process.env.MOLLIE_API_KEY,
  mollieWebhookToken: process.env.MOLLIE_WEBHOOK_TOKEN,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  appleClientId: process.env.APPLE_CLIENT_ID,
  appleTeamId: process.env.APPLE_TEAM_ID,
  appleKeyId: process.env.APPLE_KEY_ID,
  applePrivateKey: process.env.APPLE_PRIVATE_KEY?.split('\\n').join('\n'),
}));
