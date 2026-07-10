-- AlterTable
-- [SEC] IF NOT EXISTS: mirrors the defensive pattern used for the Google Calendar
-- columns (20251215040134_add_dynamic_pipelines_and_stages) — these two columns
-- were added to schema.prisma without a migration, which broke EVERY query on
-- User (including login) in production with P2022 "column does not exist".
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "outlookCalendarToken" TEXT,
    ADD COLUMN IF NOT EXISTS "outlookCalendarRefreshToken" TEXT;
