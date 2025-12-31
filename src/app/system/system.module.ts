import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AppConfigModule } from '../config/app-config.module';
import { SystemObservabilityService } from './system-observability.service';

@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [SystemObservabilityService],
  exports: [SystemObservabilityService],
})
export class SystemModule {}
