-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "opsNotes" TEXT,
ADD COLUMN     "providerNotes" TEXT,
ADD COLUMN     "reminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderNotes" TEXT;
