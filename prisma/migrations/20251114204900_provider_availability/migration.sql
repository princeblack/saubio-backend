/*
  Warnings:

  - Made the column `createdAt` on table `ProviderServiceZone` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `ProviderServiceZone` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."ProviderServiceZone" DROP CONSTRAINT "ProviderServiceZone_providerId_fkey";

-- DropIndex
DROP INDEX "public"."ProviderServiceZone_providerId_idx";

-- AlterTable
ALTER TABLE "ProviderServiceZone" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProviderAvailabilitySlot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "providerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProviderAvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTimeOff" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "providerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "ProviderTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderAvailabilitySlot_providerId_weekday_idx" ON "ProviderAvailabilitySlot"("providerId", "weekday");

-- CreateIndex
CREATE INDEX "ProviderTimeOff_providerId_startAt_idx" ON "ProviderTimeOff"("providerId", "startAt");

-- AddForeignKey
ALTER TABLE "ProviderServiceZone" ADD CONSTRAINT "ProviderServiceZone_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAvailabilitySlot" ADD CONSTRAINT "ProviderAvailabilitySlot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTimeOff" ADD CONSTRAINT "ProviderTimeOff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
