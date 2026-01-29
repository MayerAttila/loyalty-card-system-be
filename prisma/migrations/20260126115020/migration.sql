/*
  Warnings:

  - You are about to drop the column `costumerLoyaltyCardCycleId` on the `StampingLog` table. All the data in the column will be lost.
  - You are about to drop the `Costumer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CostumerLoyaltyCard` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CostumerLoyaltyCardCycle` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `customerLoyaltyCardCycleId` to the `StampingLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Costumer" DROP CONSTRAINT "Costumer_businessId_fkey";

-- DropForeignKey
ALTER TABLE "CostumerLoyaltyCard" DROP CONSTRAINT "CostumerLoyaltyCard_costumerId_fkey";

-- DropForeignKey
ALTER TABLE "CostumerLoyaltyCard" DROP CONSTRAINT "CostumerLoyaltyCard_loyaltyCardTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "CostumerLoyaltyCardCycle" DROP CONSTRAINT "CostumerLoyaltyCardCycle_costumerLoyaltyCardId_fkey";

-- DropForeignKey
ALTER TABLE "StampingLog" DROP CONSTRAINT "StampingLog_costumerLoyaltyCardCycleId_fkey";

-- AlterTable
ALTER TABLE "StampingLog" DROP COLUMN "costumerLoyaltyCardCycleId",
ADD COLUMN     "customerLoyaltyCardCycleId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Costumer";

-- DropTable
DROP TABLE "CostumerLoyaltyCard";

-- DropTable
DROP TABLE "CostumerLoyaltyCardCycle";

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessId" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLoyaltyCard" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "loyaltyCardTemplateId" TEXT NOT NULL,
    "googleWalletObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLoyaltyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLoyaltyCardCycle" (
    "id" TEXT NOT NULL,
    "stampCount" INTEGER NOT NULL DEFAULT 0,
    "cycleNumber" INTEGER NOT NULL,
    "customerLoyaltyCardId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerLoyaltyCardCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLoyaltyCard_googleWalletObjectId_key" ON "CustomerLoyaltyCard"("googleWalletObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLoyaltyCard_customerId_loyaltyCardTemplateId_key" ON "CustomerLoyaltyCard"("customerId", "loyaltyCardTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLoyaltyCardCycle_customerLoyaltyCardId_cycleNumber_key" ON "CustomerLoyaltyCardCycle"("customerLoyaltyCardId", "cycleNumber");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyCard" ADD CONSTRAINT "CustomerLoyaltyCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyCard" ADD CONSTRAINT "CustomerLoyaltyCard_loyaltyCardTemplateId_fkey" FOREIGN KEY ("loyaltyCardTemplateId") REFERENCES "LoyaltyCardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyCardCycle" ADD CONSTRAINT "CustomerLoyaltyCardCycle_customerLoyaltyCardId_fkey" FOREIGN KEY ("customerLoyaltyCardId") REFERENCES "CustomerLoyaltyCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingLog" ADD CONSTRAINT "StampingLog_customerLoyaltyCardCycleId_fkey" FOREIGN KEY ("customerLoyaltyCardCycleId") REFERENCES "CustomerLoyaltyCardCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
