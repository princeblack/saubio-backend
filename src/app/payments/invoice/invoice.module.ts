import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AppConfigModule } from '../../config/app-config.module';
import { InvoiceService } from './invoice.service';

@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
