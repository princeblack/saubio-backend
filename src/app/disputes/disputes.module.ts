import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AuthModule],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
