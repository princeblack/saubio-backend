-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "pendingPhoneNumber" TEXT,
ADD COLUMN     "phoneVerificationCode" TEXT,
ADD COLUMN     "phoneVerificationExpiresAt" TIMESTAMP(3);
