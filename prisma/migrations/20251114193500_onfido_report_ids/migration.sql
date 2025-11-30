-- Add Onfido report ids to provider profile for easier auditing
ALTER TABLE "ProviderProfile"
ADD COLUMN     "onfidoReportIds" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;
