-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('BASE_RATE', 'ECO_SURCHARGE', 'LOYALTY_EARN', 'LOYALTY_REDEEM');

-- CreateEnum
CREATE TYPE "PricingRuleAudience" AS ENUM ('GENERAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

-- AlterTable
ALTER TABLE "EmailQueue" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotalCents" INTEGER NOT NULL,
    "ecoSurchargeCents" INTEGER NOT NULL DEFAULT 0,
    "loyaltyCreditsCents" INTEGER NOT NULL DEFAULT 0,
    "extrasCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT,
    "documentId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PricingRuleType" NOT NULL,
    "audience" "PricingRuleAudience" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "amountCents" INTEGER,
    "percentageBps" INTEGER,
    "multiplier" DOUBLE PRECISION,
    "minSquareMeters" INTEGER,
    "maxSquareMeters" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyBalance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRedeemed" INTEGER NOT NULL DEFAULT 0,
    "lastEarnedAt" TIMESTAMP(3),
    "lastRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "LoyaltyBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balanceId" TEXT NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_documentId_key" ON "Invoice"("documentId");

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_code_key" ON "PricingRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyBalance_clientId_key" ON "LoyaltyBalance"("clientId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_balanceId_idx" ON "LoyaltyTransaction"("balanceId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_bookingId_idx" ON "LoyaltyTransaction"("bookingId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_paymentId_idx" ON "LoyaltyTransaction"("paymentId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyBalance" ADD CONSTRAINT "LoyaltyBalance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "LoyaltyBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
