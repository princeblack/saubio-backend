-- Drop stripeAccountId now that payouts are PSP-agnostic
ALTER TABLE "ProviderProfile" DROP COLUMN IF EXISTS "stripeAccountId";

-- Ensure payment tables expose a provider column before we rewrite the enum
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "PaymentMandate" ADD COLUMN IF NOT EXISTS "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE';

-- Collapse legacy Stripe provider values into Mollie and drop the enum variant
ALTER TABLE "Payment" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "PaymentMandate" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "PaymentEvent" ALTER COLUMN "provider" DROP DEFAULT;

ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
CREATE TYPE "PaymentProvider" AS ENUM ('MOLLIE', 'ADYEN', 'OTHER');

ALTER TABLE "Payment"
  ALTER COLUMN "provider" TYPE "PaymentProvider" USING (
    CASE
      WHEN "provider"::text = 'STRIPE' THEN 'MOLLIE'
      ELSE "provider"::text
    END::"PaymentProvider"
  ),
  ALTER COLUMN "provider" SET DEFAULT 'MOLLIE';

ALTER TABLE "PaymentMandate"
  ALTER COLUMN "provider" TYPE "PaymentProvider" USING (
    CASE
      WHEN "provider"::text = 'STRIPE' THEN 'MOLLIE'
      ELSE "provider"::text
    END::"PaymentProvider"
  ),
  ALTER COLUMN "provider" SET DEFAULT 'MOLLIE';

ALTER TABLE "PaymentEvent"
  ALTER COLUMN "provider" TYPE "PaymentProvider" USING (
    CASE
      WHEN "provider"::text = 'STRIPE' THEN 'MOLLIE'
      ELSE "provider"::text
    END::"PaymentProvider"
  ),
  ALTER COLUMN "provider" SET DEFAULT 'MOLLIE';

DROP TYPE "PaymentProvider_old";
