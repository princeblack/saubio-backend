-- DropForeignKey
ALTER TABLE "GdprRequest" DROP CONSTRAINT "GdprRequest_userId_fkey";

-- DropForeignKey
ALTER TABLE "GdprRequestAudit" DROP CONSTRAINT "GdprRequestAudit_requestId_fkey";

-- DropForeignKey
ALTER TABLE "IdentityAuditLog" DROP CONSTRAINT "IdentityAuditLog_providerId_fkey";

-- DropForeignKey
ALTER TABLE "MarketingSettingLog" DROP CONSTRAINT "MarketingSettingLog_settingId_fkey";

-- DropIndex
DROP INDEX "MarketingCampaign_createdById_idx";

-- DropIndex
DROP INDEX "PromoCode_usageCount_idx";

-- DropIndex
DROP INDEX "SupportTicket_bookingId_idx";

-- AlterTable
ALTER TABLE "GdprRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IdentityDocumentType" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketingCampaign" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketingLandingPage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketingSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NotificationAutomationRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NotificationTemplate" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "locales" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ReferralInvite" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SecurityIncident" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserConsent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WebhookEventLog" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "IdentityAuditLog" ADD CONSTRAINT "IdentityAuditLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GdprRequest" ADD CONSTRAINT "GdprRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GdprRequestAudit" ADD CONSTRAINT "GdprRequestAudit_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GdprRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSettingLog" ADD CONSTRAINT "MarketingSettingLog_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "MarketingSetting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
