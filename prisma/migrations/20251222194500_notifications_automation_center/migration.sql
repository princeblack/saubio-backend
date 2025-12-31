DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificationdeliverystatus') THEN
    CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING','SENT','DELIVERED','FAILED','BOUNCED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificationtemplatestatus') THEN
    CREATE TYPE "NotificationTemplateStatus" AS ENUM ('ACTIVE','DISABLED','ARCHIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificationautomationevent') THEN
    CREATE TYPE "NotificationAutomationEvent" AS ENUM ('BOOKING_CREATED','BOOKING_CONFIRMED','BOOKING_COMPLETED','PAYMENT_FAILED','MATCHING_PROGRESS','SMART_MATCH_TRIGGERED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificationautomationaudience') THEN
    CREATE TYPE "NotificationAutomationAudience" AS ENUM ('CLIENT','PROVIDER','ADMIN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'channel') THEN
    ALTER TABLE "Notification" ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'deliveryStatus') THEN
    ALTER TABLE "Notification" ADD COLUMN "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'templateKey') THEN
    ALTER TABLE "Notification" ADD COLUMN "templateKey" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'bookingId') THEN
    ALTER TABLE "Notification" ADD COLUMN "bookingId" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'providerId') THEN
    ALTER TABLE "Notification" ADD COLUMN "providerId" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'contextClientId') THEN
    ALTER TABLE "Notification" ADD COLUMN "contextClientId" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'contextMetadata') THEN
    ALTER TABLE "Notification" ADD COLUMN "contextMetadata" JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'errorCode') THEN
    ALTER TABLE "Notification" ADD COLUMN "errorCode" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'errorMessage') THEN
    ALTER TABLE "Notification" ADD COLUMN "errorMessage" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_bookingId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_providerId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Create NotificationTemplate table
CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "NotificationTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
  "supportedChannels" "NotificationChannel"[] NOT NULL DEFAULT ARRAY['IN_APP','EMAIL']::"NotificationChannel"[],
  "activeChannels" "NotificationChannel"[] NOT NULL DEFAULT ARRAY['IN_APP','EMAIL']::"NotificationChannel"[],
  "locales" TEXT[],
  "metadata" JSONB
);

-- Create NotificationAutomationRule table
CREATE TABLE IF NOT EXISTS "NotificationAutomationRule" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "event" "NotificationAutomationEvent" NOT NULL,
  "audience" "NotificationAutomationAudience" NOT NULL DEFAULT 'CLIENT',
  "channels" "NotificationChannel"[] NOT NULL DEFAULT ARRAY['IN_APP']::"NotificationChannel"[],
  "delaySeconds" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "conditions" JSONB,
  "templateId" TEXT,
  CONSTRAINT "NotificationAutomationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Seed default notification templates/rules can be handled in application bootstrap.
