-- DropForeignKey
ALTER TABLE "public"."Booking" DROP CONSTRAINT "Booking_clientId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "guestToken" TEXT,
ALTER COLUMN "clientId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
