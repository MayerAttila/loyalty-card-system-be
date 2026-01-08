/*
  Warnings:

  - You are about to drop the column `email` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `userLoyaltyCardCycleId` on the `StampingLog` table. All the data in the column will be lost.
  - You are about to drop the `Employee` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserLoyaltyCard` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserLoyaltyCardCycle` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `costumerLoyaltyCardCycleId` to the `StampingLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `businessId` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_businessId_fkey";

-- DropForeignKey
ALTER TABLE "StampingLog" DROP CONSTRAINT "StampingLog_stampedById_fkey";

-- DropForeignKey
ALTER TABLE "StampingLog" DROP CONSTRAINT "StampingLog_userLoyaltyCardCycleId_fkey";

-- DropForeignKey
ALTER TABLE "UserLoyaltyCard" DROP CONSTRAINT "UserLoyaltyCard_loyaltyCardTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "UserLoyaltyCard" DROP CONSTRAINT "UserLoyaltyCard_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserLoyaltyCardCycle" DROP CONSTRAINT "UserLoyaltyCardCycle_userLoyaltyCardId_fkey";

-- DropIndex
DROP INDEX "Business_email_key";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "email",
DROP COLUMN "password";

-- AlterTable
ALTER TABLE "StampingLog" DROP COLUMN "userLoyaltyCardCycleId",
ADD COLUMN     "costumerLoyaltyCardCycleId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "businessId" TEXT NOT NULL,
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "role" "EmployeeRole" NOT NULL DEFAULT 'STAFF';

-- DropTable
DROP TABLE "Employee";

-- DropTable
DROP TABLE "UserLoyaltyCard";

-- DropTable
DROP TABLE "UserLoyaltyCardCycle";

-- CreateTable
CREATE TABLE "Costumer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Costumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostumerLoyaltyCard" (
    "id" TEXT NOT NULL,
    "costumerId" TEXT NOT NULL,
    "loyaltyCardTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostumerLoyaltyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostumerLoyaltyCardCycle" (
    "id" TEXT NOT NULL,
    "stampCount" INTEGER NOT NULL DEFAULT 0,
    "cycleNumber" INTEGER NOT NULL,
    "costumerLoyaltyCardId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CostumerLoyaltyCardCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Costumer_email_key" ON "Costumer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CostumerLoyaltyCard_costumerId_loyaltyCardTemplateId_key" ON "CostumerLoyaltyCard"("costumerId", "loyaltyCardTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "CostumerLoyaltyCardCycle_costumerLoyaltyCardId_cycleNumber_key" ON "CostumerLoyaltyCardCycle"("costumerLoyaltyCardId", "cycleNumber");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostumerLoyaltyCard" ADD CONSTRAINT "CostumerLoyaltyCard_costumerId_fkey" FOREIGN KEY ("costumerId") REFERENCES "Costumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostumerLoyaltyCard" ADD CONSTRAINT "CostumerLoyaltyCard_loyaltyCardTemplateId_fkey" FOREIGN KEY ("loyaltyCardTemplateId") REFERENCES "LoyaltyCardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostumerLoyaltyCardCycle" ADD CONSTRAINT "CostumerLoyaltyCardCycle_costumerLoyaltyCardId_fkey" FOREIGN KEY ("costumerLoyaltyCardId") REFERENCES "CostumerLoyaltyCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingLog" ADD CONSTRAINT "StampingLog_costumerLoyaltyCardCycleId_fkey" FOREIGN KEY ("costumerLoyaltyCardCycleId") REFERENCES "CostumerLoyaltyCardCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingLog" ADD CONSTRAINT "StampingLog_stampedById_fkey" FOREIGN KEY ("stampedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
