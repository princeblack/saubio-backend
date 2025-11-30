-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "signupFeePaidAt" TIMESTAMP(3),
ADD COLUMN     "welcomeSessionCompletedAt" TIMESTAMP(3);
