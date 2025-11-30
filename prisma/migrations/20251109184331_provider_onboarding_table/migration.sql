-- CreateEnum
CREATE TYPE "ProviderOnboardingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProviderOnboardingRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "ProviderType" NOT NULL,
    "contactName" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "languages" TEXT[],
    "serviceAreas" TEXT[],
    "message" TEXT,
    "status" "ProviderOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderOnboardingRequest_pkey" PRIMARY KEY ("id")
);
