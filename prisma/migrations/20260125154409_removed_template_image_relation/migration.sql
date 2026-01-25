/*
  Warnings:

  - You are about to drop the column `loyaltyCardTemplateId` on the `Image` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Image" DROP CONSTRAINT "Image_loyaltyCardTemplateId_fkey";

-- DropIndex
DROP INDEX "Image_loyaltyCardTemplateId_kind_idx";

-- AlterTable
ALTER TABLE "Image" DROP COLUMN "loyaltyCardTemplateId";

-- AlterTable
ALTER TABLE "LoyaltyCardTemplate" ADD COLUMN     "stampOffImageId" TEXT,
ADD COLUMN     "stampOnImageId" TEXT,
ADD COLUMN     "useStampImages" BOOLEAN NOT NULL DEFAULT true;
