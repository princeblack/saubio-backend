-- CreateTable
CREATE TABLE "PostalFollowUpRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "normalizedPostalCode" TEXT NOT NULL,
    "normalizedCity" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PostalFollowUpRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PostalFollowUpRequest_email_normalizedPostalCode_key" UNIQUE ("email", "normalizedPostalCode")
);

-- CreateIndex
CREATE INDEX "PostalFollowUpRequest_normalizedPostalCode_idx" ON "PostalFollowUpRequest"("normalizedPostalCode");

-- CreateIndex
CREATE INDEX "PostalFollowUpRequest_email_idx" ON "PostalFollowUpRequest"("email");

-- Trigger to update updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_postal_follow_up_requests_updated_at
BEFORE UPDATE ON "PostalFollowUpRequest"
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
