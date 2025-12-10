-- RESET ALL WHATSAPP DATA - USE WITH CAUTION
-- This will delete ALL WhatsApp conversations and users
-- 1. Delete all messages first (foreign key constraint)
DELETE FROM "messages"
WHERE "conversationId" IN (
        SELECT id
        FROM "conversations"
        WHERE "channelId" IS NOT NULL
    );
-- 2. Delete all WhatsApp conversations
DELETE FROM "conversations"
WHERE "channelId" IS NOT NULL;
-- 3. Delete all WhatsApp customer users
DELETE FROM "users"
WHERE email LIKE '%@whatsapp.user';
-- 4. Delete all WhatsApp mobile agent users
DELETE FROM "users"
WHERE email LIKE 'mobile_%@reply.com';
-- 5. Delete all WhatsApp credentials
DELETE FROM "whatsapp_credentials";
-- 6. Delete all WhatsApp sessions
DELETE FROM "whatsapp_sessions";
SELECT 'All WhatsApp data has been reset!' as result;