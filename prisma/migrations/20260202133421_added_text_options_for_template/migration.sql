/*
  Warnings:

  - You are about to drop the column `title` on the `LoyaltyCardTemplate` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[businessId,template]` on the table `LoyaltyCardTemplate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `template` to the `LoyaltyCardTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "LoyaltyCardTemplate_businessId_title_key";

-- AlterTable
ALTER TABLE "LoyaltyCardTemplate" DROP COLUMN "title",
ADD COLUMN     "template" TEXT NOT NULL,
ADD COLUMN     "text1" TEXT,
ADD COLUMN     "text2" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCardTemplate_businessId_template_key" ON "LoyaltyCardTemplate"("businessId", "template");
