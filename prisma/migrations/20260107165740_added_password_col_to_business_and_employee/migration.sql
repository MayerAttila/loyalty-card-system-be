/*
  Warnings:

  - Added the required column `password` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `Employee` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "password" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "password" TEXT NOT NULL;
