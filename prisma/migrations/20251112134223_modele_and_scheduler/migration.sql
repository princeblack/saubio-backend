-- CreateEnum
CREATE TYPE "PayoutBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProviderPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutBatchTrigger" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "PaymentDistribution" ADD COLUMN     "providerPayoutId" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "kycStatus" TEXT DEFAULT 'pending',
ADD COLUMN     "payoutReady" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "PayoutBatchStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "PayoutBatchTrigger" NOT NULL DEFAULT 'AUTO',
    "note" TEXT,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPayout" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "ProviderPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" TEXT,
    "availableOn" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "missions" JSONB NOT NULL,

    CONSTRAINT "ProviderPayout_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProviderPayout" ADD CONSTRAINT "ProviderPayout_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPayout" ADD CONSTRAINT "ProviderPayout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDistribution" ADD CONSTRAINT "PaymentDistribution_providerPayoutId_fkey" FOREIGN KEY ("providerPayoutId") REFERENCES "ProviderPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
