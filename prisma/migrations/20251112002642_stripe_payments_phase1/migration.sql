/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `ClientProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `amountCents` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'REQUIRES_ACTION';
ALTER TYPE "PaymentStatus" ADD VALUE 'CAPTURE_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'HELD';
ALTER TYPE "PaymentStatus" ADD VALUE 'RELEASED';
ALTER TYPE "PaymentStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "defaultPaymentMethodId" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "amountCents" INTEGER NOT NULL,
ADD COLUMN     "authorizedAt" TIMESTAMP(3),
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT,
ADD COLUMN     "stripeSetupIntentId" TEXT;

-- AlterTable
ALTER TABLE "PaymentDistribution" ADD COLUMN     "availableOn" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "releasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "payoutLast4" TEXT,
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "stripeAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_stripeCustomerId_key" ON "ClientProfile"("stripeCustomerId");
