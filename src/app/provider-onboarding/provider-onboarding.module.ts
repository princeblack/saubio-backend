import { Module } from '@nestjs/common';
import { ProviderOnboardingController } from './provider-onboarding.controller';
import { ProviderOnboardingService } from './provider-onboarding.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppConfigModule } from '../config/app-config.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AppConfigModule],
  controllers: [ProviderOnboardingController],
  providers: [ProviderOnboardingService],
  exports: [ProviderOnboardingService],
})
export class ProviderOnboardingModule {}
