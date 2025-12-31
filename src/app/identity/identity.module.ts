import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityVerificationsController } from './identity-verifications.controller';
import { IdentityDocumentTypesController } from './identity-document-types.controller';
import { IdentityAuditController } from './identity-audit.controller';
import { AdminIdentityService } from './admin-identity.service';
import { IdentityDocumentTypesService } from './identity-document-types.service';
import { IdentityAuditService } from './identity-audit.service';

@Module({
  imports: [AuthModule, NotificationsModule, PrismaModule],
  controllers: [IdentityVerificationsController, IdentityDocumentTypesController, IdentityAuditController],
  providers: [AdminIdentityService, IdentityDocumentTypesService, IdentityAuditService],
  exports: [IdentityDocumentTypesService, IdentityAuditService],
})
export class IdentityModule {}
