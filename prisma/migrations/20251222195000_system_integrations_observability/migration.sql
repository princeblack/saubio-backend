-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "WebhookEventLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "resourceId" TEXT,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingLatencyMs" INTEGER,
    "requestUrl" TEXT,
    "signatureValid" BOOLEAN,
    "errorMessage" TEXT,
    "headers" JSONB,
    "payload" JSONB,
    "metadata" JSONB,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "providerProfileId" TEXT,
    "userId" TEXT,
    "replayAttemptedAt" TIMESTAMP(3),
    "replayStatus" "WebhookDeliveryStatus",
    "replayError" TEXT,
    CONSTRAINT "WebhookEventLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "WebhookEventLog_provider_receivedAt_idx" ON "WebhookEventLog"("provider", "receivedAt");
CREATE INDEX "WebhookEventLog_status_receivedAt_idx" ON "WebhookEventLog"("status", "receivedAt");
CREATE INDEX "WebhookEventLog_bookingId_idx" ON "WebhookEventLog"("bookingId");
CREATE INDEX "WebhookEventLog_paymentId_idx" ON "WebhookEventLog"("paymentId");
CREATE INDEX "WebhookEventLog_providerProfileId_idx" ON "WebhookEventLog"("providerProfileId");
CREATE INDEX "WebhookEventLog_userId_idx" ON "WebhookEventLog"("userId");

-- Foreign Keys
ALTER TABLE "WebhookEventLog"
  ADD CONSTRAINT "WebhookEventLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEventLog"
  ADD CONSTRAINT "WebhookEventLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEventLog"
  ADD CONSTRAINT "WebhookEventLog_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEventLog"
  ADD CONSTRAINT "WebhookEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
