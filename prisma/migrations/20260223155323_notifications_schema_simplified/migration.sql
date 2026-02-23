-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "NotificationDeliveryMode" AS ENUM ('NOW', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "NotificationScheduleType" AS ENUM ('ONCE', 'REPEAT');

-- CreateEnum
CREATE TYPE "NotificationWeekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "NotificationTriggerType" AS ENUM ('MANUAL_NOW', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('APPLE_WALLET', 'GOOGLE_WALLET');

-- CreateEnum
CREATE TYPE "NotificationLogStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "deliveryMode" "NotificationDeliveryMode" NOT NULL,
    "scheduleType" "NotificationScheduleType" NOT NULL DEFAULT 'ONCE',
    "scheduledAtUtc" TIMESTAMP(3),
    "repeatDays" "NotificationWeekday"[],
    "repeatTimeLocal" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextRunAtUtc" TIMESTAMP(3),
    "lastRunAtUtc" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerLoyaltyCardId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "triggerType" "NotificationTriggerType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationLogStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledForUtc" TIMESTAMP(3),
    "attemptedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_businessId_status_nextRunAtUtc_idx" ON "Notification"("businessId", "status", "nextRunAtUtc");

-- CreateIndex
CREATE INDEX "Notification_businessId_createdAt_idx" ON "Notification"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdById_createdAt_idx" ON "Notification"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_notificationId_createdAt_idx" ON "NotificationLog"("notificationId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_executionId_createdAt_idx" ON "NotificationLog"("executionId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_businessId_status_createdAt_idx" ON "NotificationLog"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_customerLoyaltyCardId_createdAt_idx" ON "NotificationLog"("customerLoyaltyCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_executionId_customerLoyaltyCardId_channel_key" ON "NotificationLog"("executionId", "customerLoyaltyCardId", "channel");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_customerLoyaltyCardId_fkey" FOREIGN KEY ("customerLoyaltyCardId") REFERENCES "CustomerLoyaltyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
