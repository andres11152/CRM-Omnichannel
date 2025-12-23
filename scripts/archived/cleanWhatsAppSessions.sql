-- Clean all WhatsApp sessions and credentials
-- This will force a fresh start for all WhatsApp connections
-- 1. Delete all WhatsApp credentials (auth data)
DELETE FROM "whatsapp_credentials";
-- 2. Delete all WhatsApp sessions
DELETE FROM "whatsapp_sessions";
-- 3. Optional: Delete conversations with session-based channelIds
DELETE FROM "conversations"
WHERE "channelId" LIKE 'session_%';
-- 4. Reset conversations to have proper phone-based channelIds
-- This finds duplicate conversations and keeps only the most recent one
WITH duplicates AS (
    SELECT c.id,
        ROW_NUMBER() OVER (
            PARTITION BY c."companyId",
            u.email
            ORDER BY c."updatedAt" DESC
        ) as row_num
    FROM conversations c
        JOIN "_Participants" p ON p."A" = c.id
        JOIN users u ON u.id = p."B"
    WHERE u.email LIKE '%@whatsapp.user'
)
DELETE FROM conversations
WHERE id IN (
        SELECT id
        FROM duplicates
        WHERE row_num > 1
    );
SELECT 'WhatsApp sessions cleaned successfully!' as result;