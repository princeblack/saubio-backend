CREATE TYPE "SoilLevel" AS ENUM ('LIGHT', 'NORMAL', 'STRONG', 'EXTREME');

ALTER TABLE "Booking"
  ALTER COLUMN "surfacesSquareMeters" TYPE DECIMAL(10,2) USING "surfacesSquareMeters"::decimal,
  ALTER COLUMN "surfacesSquareMeters" DROP NOT NULL;

ALTER TABLE "Booking"
  ADD COLUMN "durationHours" DECIMAL(5,2),
  ADD COLUMN "recommendedHours" DECIMAL(5,2),
  ADD COLUMN "durationManuallyAdjusted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "couponCode" TEXT,
  ADD COLUMN "contactFirstName" TEXT,
  ADD COLUMN "contactLastName" TEXT,
  ADD COLUMN "contactCompany" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "contactStreetLine1" TEXT,
  ADD COLUMN "contactStreetLine2" TEXT,
  ADD COLUMN "contactPostalCode" TEXT,
  ADD COLUMN "contactCity" TEXT,
  ADD COLUMN "contactCountryCode" TEXT,
  ADD COLUMN "contactAccessNotes" TEXT,
  ADD COLUMN "onsiteContactFirstName" TEXT,
  ADD COLUMN "onsiteContactLastName" TEXT,
  ADD COLUMN "onsiteContactPhone" TEXT,
  ADD COLUMN "billingStreetLine1" TEXT,
  ADD COLUMN "billingStreetLine2" TEXT,
  ADD COLUMN "billingPostalCode" TEXT,
  ADD COLUMN "billingCity" TEXT,
  ADD COLUMN "billingCountryCode" TEXT,
  ADD COLUMN "billingAccessNotes" TEXT,
  ADD COLUMN "soilLevel" "SoilLevel",
  ADD COLUMN "cleaningPreferences" JSONB,
  ADD COLUMN "upholsteryDetails" JSONB,
  ADD COLUMN "additionalInstructions" TEXT;
