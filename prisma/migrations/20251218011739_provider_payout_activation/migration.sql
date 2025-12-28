-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "payoutAccountHolder" TEXT,
ADD COLUMN     "payoutActivationStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "payoutBankName" TEXT,
ADD COLUMN     "payoutIbanCountry" TEXT,
ADD COLUMN     "payoutIbanMasked" TEXT,
ADD COLUMN     "payoutMollieCustomerId" TEXT,
ADD COLUMN     "payoutMollieMandateId" TEXT;
