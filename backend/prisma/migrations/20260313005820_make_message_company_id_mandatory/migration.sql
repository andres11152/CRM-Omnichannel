/*
  Warnings:

  - Made the column `companyId` on table `messages` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "companyId" SET NOT NULL;
