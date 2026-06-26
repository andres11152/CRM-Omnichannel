-- AlterTable: add optional description to webhooks
ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "description" TEXT;
