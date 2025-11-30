-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "identityVerificationNotes" TEXT,
ADD COLUMN     "identityVerificationReviewedAt" TIMESTAMP(3),
ADD COLUMN     "identityVerificationReviewer" TEXT,
ADD COLUMN     "identityVerificationStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED';
