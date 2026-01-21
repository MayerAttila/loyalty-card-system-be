/*
  Warnings:

  - A unique constraint covering the columns `[googleWalletObjectId]` on the table `CostumerLoyaltyCard` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[googleWalletClassId]` on the table `LoyaltyCardTemplate` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CostumerLoyaltyCard" ADD COLUMN     "googleWalletObjectId" TEXT;

-- AlterTable
ALTER TABLE "LoyaltyCardTemplate" ADD COLUMN     "googleWalletClassId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "CostumerLoyaltyCard_googleWalletObjectId_key" ON "CostumerLoyaltyCard"("googleWalletObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCardTemplate_googleWalletClassId_key" ON "LoyaltyCardTemplate"("googleWalletClassId");
