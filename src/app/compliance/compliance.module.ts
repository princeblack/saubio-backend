import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppConfigModule } from '../config/app-config.module';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';

@Module({
  imports: [AuthModule, PrismaModule, NotificationsModule, AppConfigModule],
  controllers: [GdprController, ConsentsController],
  providers: [GdprService, ConsentsService],
})
export class ComplianceModule {}
