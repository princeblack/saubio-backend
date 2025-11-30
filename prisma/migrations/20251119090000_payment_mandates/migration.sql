-- CreateTable
CREATE TABLE "PaymentMandate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "stripeMandateId" TEXT NOT NULL,
    "stripePaymentMethodId" TEXT,
    "method" "PaymentMethod",
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "scheme" TEXT,
    "bankCountry" TEXT,
    "bankCode" TEXT,
    "last4" TEXT,
    "fingerprint" TEXT,
    "url" TEXT,
    "usage" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "customerIp" TEXT,
    "customerUserAgent" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "PaymentMandate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_stripeMandateId_key" ON "PaymentMandate"("stripeMandateId");

-- AddForeignKey
ALTER TABLE "PaymentMandate" ADD CONSTRAINT "PaymentMandate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
