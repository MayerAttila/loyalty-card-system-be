-- AlterTable
ALTER TABLE "Business" ALTER COLUMN "address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false;
