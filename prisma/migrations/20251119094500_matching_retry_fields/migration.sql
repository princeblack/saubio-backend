-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "fallbackEscalatedAt" TIMESTAMP(3),
ADD COLUMN     "matchingRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fallbackRequestedAt" TIMESTAMP(3),
ADD COLUMN     "fallbackTeamCandidateId" TEXT;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_fallbackTeamCandidateId_fkey" FOREIGN KEY ("fallbackTeamCandidateId") REFERENCES "ProviderTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
