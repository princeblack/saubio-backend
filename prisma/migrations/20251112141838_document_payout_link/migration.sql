-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "providerPayoutId" TEXT;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_providerPayoutId_fkey" FOREIGN KEY ("providerPayoutId") REFERENCES "ProviderPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
