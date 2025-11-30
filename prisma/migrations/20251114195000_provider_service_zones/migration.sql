CREATE TABLE "ProviderServiceZone" (
  "id" TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  "providerId" TEXT NOT NULL REFERENCES "ProviderProfile"(id) ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "district" TEXT,
  "countryCode" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "radiusKm" DOUBLE PRECISION DEFAULT 5,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX "ProviderServiceZone_providerId_idx" ON "ProviderServiceZone"("providerId");
