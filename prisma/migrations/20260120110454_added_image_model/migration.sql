-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('BUSINESS_LOGO', 'STAMP_ON', 'STAMP_OFF');

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessId" TEXT,
    "loyaltyCardTemplateId" TEXT,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Image_businessId_kind_idx" ON "Image"("businessId", "kind");

-- CreateIndex
CREATE INDEX "Image_loyaltyCardTemplateId_kind_idx" ON "Image"("loyaltyCardTemplateId", "kind");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_loyaltyCardTemplateId_fkey" FOREIGN KEY ("loyaltyCardTemplateId") REFERENCES "LoyaltyCardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
