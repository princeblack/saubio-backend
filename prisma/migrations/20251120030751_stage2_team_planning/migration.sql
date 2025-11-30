-- CreateEnum
CREATE TYPE "BookingTeamLockStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED');

-- AlterTable
ALTER TABLE "ProviderTeam" ADD COLUMN     "defaultDailyCapacity" INTEGER,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "TeamPlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "providerTeamId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "capacitySlots" INTEGER NOT NULL,
    "capacityBooked" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "TeamPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPlanSlot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamPlanId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamPlanSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTeamLock" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT NOT NULL,
    "providerTeamId" TEXT,
    "providerId" TEXT,
    "teamPlanSlotId" TEXT,
    "lockedCount" INTEGER NOT NULL DEFAULT 1,
    "status" "BookingTeamLockStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingTeamLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamPlan_providerTeamId_date_key" ON "TeamPlan"("providerTeamId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BookingTeamLock_bookingId_providerId_key" ON "BookingTeamLock"("bookingId", "providerId");

-- AddForeignKey
ALTER TABLE "TeamPlan" ADD CONSTRAINT "TeamPlan_providerTeamId_fkey" FOREIGN KEY ("providerTeamId") REFERENCES "ProviderTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlanSlot" ADD CONSTRAINT "TeamPlanSlot_teamPlanId_fkey" FOREIGN KEY ("teamPlanId") REFERENCES "TeamPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTeamLock" ADD CONSTRAINT "BookingTeamLock_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTeamLock" ADD CONSTRAINT "BookingTeamLock_providerTeamId_fkey" FOREIGN KEY ("providerTeamId") REFERENCES "ProviderTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTeamLock" ADD CONSTRAINT "BookingTeamLock_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTeamLock" ADD CONSTRAINT "BookingTeamLock_teamPlanSlotId_fkey" FOREIGN KEY ("teamPlanSlotId") REFERENCES "TeamPlanSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
