-- Add new notification type for identity workflows
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'IDENTITY_VERIFICATION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'identityauditaction'
  ) THEN
    CREATE TYPE "IdentityAuditAction" AS ENUM ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','RESET','REQUESTED_DOCUMENT','NOTE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ProviderProfile' AND column_name = 'identityVerificationReviewerId'
  ) THEN
    ALTER TABLE "ProviderProfile"
      ADD COLUMN "identityVerificationReviewerId" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderProfile_identityVerificationReviewerId_fkey'
  ) THEN
    ALTER TABLE "ProviderProfile"
      ADD CONSTRAINT "ProviderProfile_identityVerificationReviewerId_fkey"
      FOREIGN KEY ("identityVerificationReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "IdentityDocumentType" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "code" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT,
  "labelDe" TEXT,
  "description" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "requiredFiles" INTEGER NOT NULL DEFAULT 1,
  "applicableCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "archivedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "IdentityDocumentType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityDocumentType_code_key" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "IdentityAuditLog" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "providerId" TEXT NOT NULL,
  "documentId" TEXT,
  "actorId" TEXT,
  "actorLabel" TEXT,
  "action" "IdentityAuditAction" NOT NULL,
  "payload" JSONB,
  CONSTRAINT "IdentityAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityAuditLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IdentityAuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "IdentityAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
