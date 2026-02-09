-- 🛡️ CLEANUP: Remove LID-based duplicate conversations, tickets, and messages
-- LIDs are typically 14-16 digit numbers that look like "45908938997905"
-- Step 1: Delete messages from LID conversations
DELETE FROM messages
WHERE "conversationId" IN (
        SELECT id
        FROM conversations
        WHERE "channelId" ~ '^[0-9]{14,16}$'
    );
-- Step 2: Delete tickets from LID conversations
DELETE FROM tickets
WHERE "conversationId" IN (
        SELECT id
        FROM conversations
        WHERE "channelId" ~ '^[0-9]{14,16}$'
    );
-- Step 3: Delete the LID conversations themselves
DELETE FROM conversations
WHERE "channelId" ~ '^[0-9]{14,16}$';
-- Step 4: Delete orphaned users created with LID emails
DELETE FROM users
WHERE email ~ '^[0-9]{14,16}@whatsapp\.user$';