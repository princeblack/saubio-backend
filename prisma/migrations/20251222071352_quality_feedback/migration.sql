-- DropForeignKey
ALTER TABLE "MarketingSettingLog" DROP CONSTRAINT "MarketingSettingLog_settingId_fkey";

-- DropIndex
DROP INDEX "PromoCode_usageCount_idx";

-- AlterTable
ALTER TABLE "MarketingLandingPage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketingSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PromoCode" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "MarketingSettingLog" ADD CONSTRAINT "MarketingSettingLog_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "MarketingSetting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
