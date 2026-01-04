/*
  Warnings:

  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "name" SET NOT NULL;

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyCardTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxPoints" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessId" TEXT NOT NULL,

    CONSTRAINT "LoyaltyCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLoyaltyCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loyaltyCardTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLoyaltyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLoyaltyCardCycle" (
    "id" TEXT NOT NULL,
    "stampCount" INTEGER NOT NULL DEFAULT 0,
    "cycleNumber" INTEGER NOT NULL,
    "userLoyaltyCardId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UserLoyaltyCardCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampingLog" (
    "id" TEXT NOT NULL,
    "userLoyaltyCardCycleId" TEXT NOT NULL,
    "stampedById" TEXT NOT NULL,
    "stampedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StampingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_email_key" ON "Business"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCardTemplate_businessId_title_key" ON "LoyaltyCardTemplate"("businessId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "UserLoyaltyCard_userId_loyaltyCardTemplateId_key" ON "UserLoyaltyCard"("userId", "loyaltyCardTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "UserLoyaltyCardCycle_userLoyaltyCardId_cycleNumber_key" ON "UserLoyaltyCardCycle"("userLoyaltyCardId", "cycleNumber");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCardTemplate" ADD CONSTRAINT "LoyaltyCardTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLoyaltyCard" ADD CONSTRAINT "UserLoyaltyCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLoyaltyCard" ADD CONSTRAINT "UserLoyaltyCard_loyaltyCardTemplateId_fkey" FOREIGN KEY ("loyaltyCardTemplateId") REFERENCES "LoyaltyCardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLoyaltyCardCycle" ADD CONSTRAINT "UserLoyaltyCardCycle_userLoyaltyCardId_fkey" FOREIGN KEY ("userLoyaltyCardId") REFERENCES "UserLoyaltyCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingLog" ADD CONSTRAINT "StampingLog_userLoyaltyCardCycleId_fkey" FOREIGN KEY ("userLoyaltyCardCycleId") REFERENCES "UserLoyaltyCardCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingLog" ADD CONSTRAINT "StampingLog_stampedById_fkey" FOREIGN KEY ("stampedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
