DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE LOWER(typname) = 'marketinglandingstatus'
  ) THEN
    CREATE TYPE "MarketingLandingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE "MarketingLandingPage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "MarketingLandingStatus" NOT NULL DEFAULT 'DRAFT',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DOUBLE PRECISION,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "heroTitle" TEXT,
    "heroDescription" TEXT,
    CONSTRAINT "MarketingLandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promoCodesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "referralEnabled" BOOLEAN NOT NULL DEFAULT false,
    "marketingNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxPromoCodesPerClient" INTEGER NOT NULL DEFAULT 3,
    "stackingRules" TEXT,
    "restrictedZones" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "MarketingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSettingLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "settingId" INTEGER NOT NULL,
    "userId" TEXT,
    CONSTRAINT "MarketingSettingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingLandingPage_slug_key" ON "MarketingLandingPage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingLandingPage_path_key" ON "MarketingLandingPage"("path");

-- AddForeignKey
ALTER TABLE "MarketingSetting" ADD CONSTRAINT "MarketingSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSettingLog" ADD CONSTRAINT "MarketingSettingLog_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "MarketingSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSettingLog" ADD CONSTRAINT "MarketingSettingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default marketing setting row
INSERT INTO "MarketingSetting" ("id") VALUES (1)
ON CONFLICT ("id") DO NOTHING;

-- Intentionally keep landing pages unseeded so CMS reflects only live content
