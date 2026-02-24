-- CreateEnum
CREATE TYPE "NotificationRepeatPattern" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "monthlyDayOfMonth" INTEGER,
ADD COLUMN     "repeatPattern" "NotificationRepeatPattern";
