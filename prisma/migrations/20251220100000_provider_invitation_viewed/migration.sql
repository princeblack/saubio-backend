-- Add viewedAt column to track when providers open their invitations
ALTER TABLE "BookingInvitation"
ADD COLUMN     "viewedAt" TIMESTAMP(3);
