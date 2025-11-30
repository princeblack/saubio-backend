-- DropForeignKey
ALTER TABLE "public"."PaymentMandate" DROP CONSTRAINT "PaymentMandate_clientId_fkey";

-- CreateTable
CREATE TABLE "MatchingConfig" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "weightsJson" JSONB,
    "distanceMaxKm" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "teamBonusJson" JSONB,

    CONSTRAINT "MatchingConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaymentMandate" ADD CONSTRAINT "PaymentMandate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
