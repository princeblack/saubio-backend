-- Add optional booking relation to support tickets
ALTER TABLE "SupportTicket"
ADD COLUMN IF NOT EXISTS "bookingId" TEXT;

ALTER TABLE "SupportTicket"
ADD CONSTRAINT IF NOT EXISTS "SupportTicket_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create a helper index to speed up lookups by booking
CREATE INDEX IF NOT EXISTS "SupportTicket_bookingId_idx" ON "SupportTicket" ("bookingId");
