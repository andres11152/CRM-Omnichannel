-- Delete the duplicate conversation with LID
-- Keep only the one with resolved phone number
DELETE FROM "messages"
WHERE "conversationId" IN (
        SELECT id
        FROM "conversations"
        WHERE "channelId" LIKE '%45908938997905%lid%'
    );
DELETE FROM "tickets"
WHERE "conversationId" IN (
        SELECT id
        FROM "conversations"
        WHERE "channelId" LIKE '%45908938997905%lid%'
    );
DELETE FROM "conversations"
WHERE "channelId" LIKE '%45908938997905%lid%';
-- Show remaining conversations
SELECT id,
    "channelId",
    status,
    "createdAt"
FROM "conversations";