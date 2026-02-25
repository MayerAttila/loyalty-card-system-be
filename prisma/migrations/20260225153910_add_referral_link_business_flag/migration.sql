-- CreateEnum
CREATE TYPE "ReferralLinkStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "referralLinkId" TEXT;

-- CreateTable
CREATE TABLE "ReferralLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReferralLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "landingPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLink_code_key" ON "ReferralLink"("code");

-- CreateIndex
CREATE INDEX "ReferralLink_status_createdAt_idx" ON "ReferralLink"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralLink_code_status_idx" ON "ReferralLink"("code", "status");

-- CreateIndex
CREATE INDEX "Business_referralLinkId_idx" ON "Business"("referralLinkId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_referralLinkId_fkey" FOREIGN KEY ("referralLinkId") REFERENCES "ReferralLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
