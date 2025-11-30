-- Create Enums
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MOLLIE', 'ADYEN', 'OTHER');
CREATE TYPE "EmailQueueStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Create tables
CREATE TABLE "PaymentEvent" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "paymentId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

CREATE TABLE "EmailQueue" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailQueueStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT
);

CREATE INDEX "EmailQueue_status_scheduledAt_idx" ON "EmailQueue"("status", "scheduledAt");
