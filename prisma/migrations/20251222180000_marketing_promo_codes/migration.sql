DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE LOWER(typname) = 'promocodetype'
  ) THEN
    CREATE TYPE "PromoCodeType" AS ENUM ('FIXED', 'PERCENT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PromoCode" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromoCodeType" NOT NULL,
    "fixedAmountCents" INTEGER,
    "percentage" INTEGER,
    "description" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxTotalUsages" INTEGER,
    "maxUsagesPerUser" INTEGER,
    "minBookingTotalCents" INTEGER,
    "applicableServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicablePostalCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "metadata" JSONB,
    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PromoCodeUsage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promoCodeId" TEXT NOT NULL,
    "bookingId" TEXT,
    "clientId" TEXT,
    "amountDiscountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT,
    "metadata" JSONB,
    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Booking' AND column_name = 'promoCodeId'
  ) THEN
    ALTER TABLE "Booking"
      ADD COLUMN "promoCodeId" TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX IF NOT EXISTS "PromoCode_usageCount_idx" ON "PromoCode"("usageCount");
CREATE INDEX IF NOT EXISTS "PromoCodeUsage_promoCodeId_idx" ON "PromoCodeUsage"("promoCodeId");
CREATE INDEX IF NOT EXISTS "PromoCodeUsage_bookingId_idx" ON "PromoCodeUsage"("bookingId");
CREATE INDEX IF NOT EXISTS "PromoCodeUsage_clientId_idx" ON "PromoCodeUsage"("clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "PromoCodeUsage_promoCodeId_bookingId_key" ON "PromoCodeUsage"("promoCodeId", "bookingId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PromoCode_createdById_fkey'
  ) THEN
    ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PromoCodeUsage_promoCodeId_fkey'
  ) THEN
    ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PromoCodeUsage_bookingId_fkey'
  ) THEN
    ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PromoCodeUsage_clientId_fkey'
  ) THEN
    ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Booking_promoCodeId_fkey'
  ) THEN
    ALTER TABLE "Booking" ADD CONSTRAINT "Booking_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
