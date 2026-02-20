ALTER TABLE "AppleWalletRegistration"
ADD COLUMN "cardId" TEXT;

ALTER TABLE "AppleWalletSerialUpdate"
ADD COLUMN "cardId" TEXT;

UPDATE "AppleWalletRegistration" r
SET "cardId" = c."id"
FROM "CustomerLoyaltyCard" c
WHERE r."serialNumber" = c."id";

UPDATE "AppleWalletSerialUpdate" s
SET "cardId" = c."id"
FROM "CustomerLoyaltyCard" c
WHERE s."serialNumber" = c."id";

DELETE FROM "AppleWalletRegistration"
WHERE "cardId" IS NULL;

DELETE FROM "AppleWalletSerialUpdate"
WHERE "cardId" IS NULL;

ALTER TABLE "AppleWalletRegistration"
ALTER COLUMN "cardId" SET NOT NULL;

ALTER TABLE "AppleWalletSerialUpdate"
ALTER COLUMN "cardId" SET NOT NULL;

ALTER TABLE "AppleWalletRegistration"
ADD CONSTRAINT "AppleWalletRegistration_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "CustomerLoyaltyCard"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppleWalletSerialUpdate"
ADD CONSTRAINT "AppleWalletSerialUpdate_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "CustomerLoyaltyCard"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AppleWalletRegistration_cardId_idx"
ON "AppleWalletRegistration"("cardId");

CREATE INDEX "AppleWalletSerialUpdate_cardId_idx"
ON "AppleWalletSerialUpdate"("cardId");
