DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'MarketingSettingLog'
  ) THEN
    ALTER TABLE "MarketingSettingLog" DROP CONSTRAINT IF EXISTS "MarketingSettingLog_settingId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'promocode_usagecount_idx'
  ) THEN
    DROP INDEX "PromoCode_usageCount_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'MarketingLandingPage'
  ) THEN
    EXECUTE 'ALTER TABLE "MarketingLandingPage" ALTER COLUMN "updatedAt" DROP DEFAULT';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'MarketingSetting'
  ) THEN
    EXECUTE 'ALTER TABLE "MarketingSetting" ALTER COLUMN "updatedAt" DROP DEFAULT';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PromoCode'
  ) THEN
    EXECUTE 'ALTER TABLE "PromoCode" ALTER COLUMN "updatedAt" DROP DEFAULT';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'MarketingSettingLog'
  ) THEN
    ALTER TABLE "MarketingSettingLog"
    ADD CONSTRAINT "MarketingSettingLog_settingId_fkey"
    FOREIGN KEY ("settingId") REFERENCES "MarketingSetting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
