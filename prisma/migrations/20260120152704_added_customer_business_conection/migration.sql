/*
  Warnings:

  - Added the required column `businessId` to the `Costumer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Costumer" ADD COLUMN     "businessId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Costumer_businessId_idx" ON "Costumer"("businessId");

-- AddForeignKey
ALTER TABLE "Costumer" ADD CONSTRAINT "Costumer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
