-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE LOWER(typname) = 'reviewstatus') THEN
    CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'FLAGGED');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS "moderationNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "moderatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "moderatedAt" TIMESTAMP(3);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Review_moderatedById_fkey'
  ) THEN
    ALTER TABLE "Review"
      ADD CONSTRAINT "Review_moderatedById_fkey"
      FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
