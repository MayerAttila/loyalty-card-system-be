-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT,
    "stripeSubscriptionId" TEXT,
    "previousStatus" TEXT,
    "nextStatus" TEXT,
    "previousPriceId" TEXT,
    "nextPriceId" TEXT,
    "previousInterval" TEXT,
    "nextInterval" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionHistory_businessId_createdAt_idx" ON "SubscriptionHistory"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_stripeSubscriptionId_createdAt_idx" ON "SubscriptionHistory"("stripeSubscriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
