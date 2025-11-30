/*
  Warnings:

  - You are about to drop the column `stripeCustomerId` on the `ClientProfile` table. All the data in the column will be lost.
  - You are about to drop the column `stripeCustomerId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `stripeMandateId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `stripePaymentIntentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `stripePaymentMethodId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `stripeSetupIntentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `stripeMandateId` on the `PaymentMandate` table. All the data in the column will be lost.
  - You are about to drop the column `stripePaymentMethodId` on the `PaymentMandate` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[externalCustomerId]` on the table `ClientProfile` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalMandateId]` on the table `PaymentMandate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `externalMandateId` to the `PaymentMandate` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."ClientProfile_stripeCustomerId_key";

-- DropIndex
DROP INDEX "public"."PaymentMandate_stripeMandateId_key";

-- AlterTable
ALTER TABLE "ClientProfile" DROP COLUMN "stripeCustomerId",
ADD COLUMN     "externalCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "stripeCustomerId",
DROP COLUMN "stripeMandateId",
DROP COLUMN "stripePaymentIntentId",
DROP COLUMN "stripePaymentMethodId",
DROP COLUMN "stripeSetupIntentId",
ADD COLUMN     "externalCustomerId" TEXT,
ADD COLUMN     "externalMandateId" TEXT,
ADD COLUMN     "externalPaymentIntentId" TEXT,
ADD COLUMN     "externalPaymentMethodId" TEXT,
ADD COLUMN     "externalSetupIntentId" TEXT;

-- AlterTable
ALTER TABLE "PaymentMandate" DROP COLUMN "stripeMandateId",
DROP COLUMN "stripePaymentMethodId",
ADD COLUMN     "externalMandateId" TEXT NOT NULL,
ADD COLUMN     "externalPaymentMethodId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_externalCustomerId_key" ON "ClientProfile"("externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_externalMandateId_key" ON "PaymentMandate"("externalMandateId");
