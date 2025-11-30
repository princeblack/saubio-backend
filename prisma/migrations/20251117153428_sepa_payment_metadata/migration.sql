-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "pricingLoyaltyCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "paymentMethodSnapshot" JSONB,
ADD COLUMN     "stripeMandateId" TEXT,
ALTER COLUMN "method" DROP NOT NULL;
