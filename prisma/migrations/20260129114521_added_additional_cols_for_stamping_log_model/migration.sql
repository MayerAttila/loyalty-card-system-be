-- AlterTable
ALTER TABLE "StampingLog" ADD COLUMN     "addedStamps" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cardCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stampCountAfter" INTEGER NOT NULL DEFAULT 0;
