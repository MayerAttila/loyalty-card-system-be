-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "locationAddress" TEXT,
ADD COLUMN     "locationLat" DOUBLE PRECISION,
ADD COLUMN     "locationLng" DOUBLE PRECISION,
ADD COLUMN     "locationPlaceId" TEXT;
