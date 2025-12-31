DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'SupportTicket'
      AND column_name = 'bookingId'
  ) THEN
    ALTER TABLE "SupportTicket"
      ADD COLUMN "bookingId" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_bookingId_fkey'
  ) THEN
    ALTER TABLE "SupportTicket"
      ADD CONSTRAINT "SupportTicket_bookingId_fkey"
      FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'SupportTicket_bookingId_idx'
  ) THEN
    CREATE INDEX "SupportTicket_bookingId_idx" ON "SupportTicket" ("bookingId");
  END IF;
END $$;
