-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trial_businessId_key" ON "Trial"("businessId");

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
