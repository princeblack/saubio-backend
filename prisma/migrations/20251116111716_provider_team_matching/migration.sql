-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "assignedTeamId" TEXT,
ADD COLUMN     "preferredTeamId" TEXT,
ADD COLUMN     "requiredProviders" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "BookingAssignment" ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "ProviderTeam" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSize" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "ProviderTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTeamMember" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "role" TEXT,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProviderTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderTeamMember_teamId_providerId_key" ON "ProviderTeamMember"("teamId", "providerId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_preferredTeamId_fkey" FOREIGN KEY ("preferredTeamId") REFERENCES "ProviderTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "ProviderTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAssignment" ADD CONSTRAINT "BookingAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProviderTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTeam" ADD CONSTRAINT "ProviderTeam_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTeamMember" ADD CONSTRAINT "ProviderTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProviderTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTeamMember" ADD CONSTRAINT "ProviderTeamMember_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
