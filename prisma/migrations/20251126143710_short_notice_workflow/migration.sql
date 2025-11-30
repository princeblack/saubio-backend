-- CreateEnum
CREATE TYPE "BookingInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "shortNotice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shortNoticeDepositCents" INTEGER;

-- CreateTable
CREATE TABLE "BookingInvitation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "BookingInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "BookingInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingInvitation_bookingId_providerId_key" ON "BookingInvitation"("bookingId", "providerId");

-- AddForeignKey
ALTER TABLE "BookingInvitation" ADD CONSTRAINT "BookingInvitation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingInvitation" ADD CONSTRAINT "BookingInvitation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
