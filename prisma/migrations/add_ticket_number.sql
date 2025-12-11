-- Add ticketNumber autoincremental column to tickets table
-- This is per-company sequential
-- 1. Add column (nullable first)
ALTER TABLE "tickets"
ADD COLUMN IF NOT EXISTS "ticketNumber" INTEGER;
-- 2. Create index for faster queries
CREATE INDEX IF NOT EXISTS "tickets_ticketNumber_companyId_idx" ON "tickets"("ticketNumber", "companyId");
-- 3. Backfill existing tickets with sequential numbers per company
WITH numbered_tickets AS (
    SELECT id,
        ROW_NUMBER() OVER (
            PARTITION BY "companyId"
            ORDER BY "createdAt"
        ) as new_number
    FROM tickets
    WHERE "ticketNumber" IS NULL
)
UPDATE tickets
SET "ticketNumber" = numbered_tickets.new_number
FROM numbered_tickets
WHERE tickets.id = numbered_tickets.id;
-- 4. Make it NOT NULL now that data is filled
ALTER TABLE "tickets"
ALTER COLUMN "ticketNumber"
SET NOT NULL;
SELECT 'Ticket numbers added successfully!' as result;