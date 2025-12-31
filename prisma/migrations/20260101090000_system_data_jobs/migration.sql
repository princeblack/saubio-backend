-- CreateEnum
CREATE TYPE "SystemApiKeyStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DataJobFormat" AS ENUM ('CSV', 'JSON');

-- CreateEnum
CREATE TYPE "DataJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DataImportEntity" AS ENUM ('USERS', 'PROVIDERS', 'BOOKINGS', 'PAYMENTS', 'ZONES', 'SERVICES', 'OTHER');

-- CreateEnum
CREATE TYPE "DataExportType" AS ENUM ('BOOKINGS', 'PAYMENTS', 'PROVIDERS', 'CLIENTS', 'DISPUTES', 'FINANCE', 'OTHER');

-- CreateTable
CREATE TABLE "SystemApiKey" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SystemApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rateLimitPerDay" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "ownerId" TEXT,

    CONSTRAINT "SystemApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "entity" "DataImportEntity" NOT NULL,
    "format" "DataJobFormat" NOT NULL,
    "status" "DataJobStatus" NOT NULL DEFAULT 'PENDING',
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER,
    "sourceFilename" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,

    CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataExportJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "type" "DataExportType" NOT NULL,
    "format" "DataJobFormat" NOT NULL,
    "status" "DataJobStatus" NOT NULL DEFAULT 'PENDING',
    "recordCount" INTEGER,
    "fileUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "parameters" JSONB,
    "requestedById" TEXT,

    CONSTRAINT "DataExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemApiKey_prefix_key" ON "SystemApiKey"("prefix");

-- AddForeignKey
ALTER TABLE "SystemApiKey" ADD CONSTRAINT "SystemApiKey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImportJob" ADD CONSTRAINT "DataImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExportJob" ADD CONSTRAINT "DataExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
