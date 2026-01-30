-- Drop unused color fields from LoyaltyCardTemplate
ALTER TABLE "LoyaltyCardTemplate" DROP COLUMN "accentColor";
ALTER TABLE "LoyaltyCardTemplate" DROP COLUMN "textColor";
