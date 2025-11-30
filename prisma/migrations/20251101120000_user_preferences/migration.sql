-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('NEVER', 'DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT false,
    "productUpdates" BOOLEAN NOT NULL DEFAULT true,
    "enableDarkMode" BOOLEAN NOT NULL DEFAULT false,
    "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'WEEKLY',
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
