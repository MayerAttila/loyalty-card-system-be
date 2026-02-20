-- CreateTable
CREATE TABLE "AppleWalletRegistration" (
    "deviceLibraryIdentifier" TEXT NOT NULL,
    "passTypeIdentifier" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleWalletRegistration_pkey" PRIMARY KEY ("deviceLibraryIdentifier","passTypeIdentifier","serialNumber")
);

-- CreateTable
CREATE TABLE "AppleWalletSerialUpdate" (
    "passTypeIdentifier" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleWalletSerialUpdate_pkey" PRIMARY KEY ("passTypeIdentifier","serialNumber")
);

-- CreateIndex
CREATE INDEX "AppleWalletRegistration_passTypeIdentifier_serialNumber_idx" ON "AppleWalletRegistration"("passTypeIdentifier", "serialNumber");

-- CreateIndex
CREATE INDEX "AppleWalletSerialUpdate_serialNumber_idx" ON "AppleWalletSerialUpdate"("serialNumber");
