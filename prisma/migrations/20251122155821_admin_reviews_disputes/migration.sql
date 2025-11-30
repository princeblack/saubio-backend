-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminReviewTarget" AS ENUM ('DOCUMENT', 'PROVIDER_PROFILE', 'BOOKING', 'PAYMENT');

-- CreateEnum
CREATE TYPE "AdminReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'REFUNDED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeParticipantRole" AS ENUM ('CLIENT', 'PROVIDER', 'ADMIN');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT;

-- CreateTable
CREATE TABLE "AdminReview" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "AdminReviewTarget" NOT NULL,
    "status" "AdminReviewStatus" NOT NULL DEFAULT 'PENDING',
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "reviewerId" TEXT,
    "documentId" TEXT,

    CONSTRAINT "AdminReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "openedById" TEXT,
    "assignedToId" TEXT,
    "resolution" TEXT,
    "refundAmountCents" INTEGER,
    "refundCurrency" TEXT DEFAULT 'EUR',
    "refundProcessedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "adminNotes" TEXT,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disputeId" TEXT NOT NULL,
    "authorId" TEXT,
    "role" "DisputeParticipantRole" NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" JSONB,

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dispute_bookingId_idx" ON "Dispute"("bookingId");

-- CreateIndex
CREATE INDEX "Dispute_paymentId_idx" ON "Dispute"("paymentId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "DisputeMessage_disputeId_idx" ON "DisputeMessage"("disputeId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminReview" ADD CONSTRAINT "AdminReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminReview" ADD CONSTRAINT "AdminReview_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
