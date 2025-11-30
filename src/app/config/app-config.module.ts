import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import configuration from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().uri().optional(),
        JWT_SECRET: Joi.string().min(16).optional(),
        JWT_ACCESS_SECRET: Joi.string().min(16).optional(),
        JWT_REFRESH_SECRET: Joi.string().min(16).optional(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().optional(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().optional(),
        APP_URL: Joi.string().uri().optional(),
        PAYPAL_CLIENT_ID: Joi.string().optional(),
        PAYPAL_CLIENT_SECRET: Joi.string().optional(),
        ENABLE_SWAGGER: Joi.boolean().optional(),
        ONFIDO_API_TOKEN: Joi.string().allow('', null).optional(),
        ONFIDO_REGION: Joi.string().valid('eu', 'us').optional(),
        ONFIDO_WEBHOOK_TOKEN: Joi.string().allow('', null).optional(),
        ONFIDO_WORKFLOW_ID: Joi.string().allow('', null).optional(),
      }),
    }),
  ],
})
export class AppConfigModule {}
