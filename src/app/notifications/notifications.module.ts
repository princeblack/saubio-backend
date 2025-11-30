import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationEventsService } from './notification-events.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailQueueService } from './email-queue.service';
import { AppConfigModule } from '../config/app-config.module';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), AppConfigModule, ScheduleModule.forRoot()],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventsService, EmailQueueService],
  exports: [NotificationsService, NotificationEventsService, EmailQueueService],
})
export class NotificationsModule {}
