-- Check what media types are stored in the DB
SELECT id,
    content,
    direction,
    metadata::text,
    "createdAt"
FROM messages
WHERE "conversationId" = (
        SELECT id
        FROM conversations
        WHERE "channelId" = '573242450628'
        LIMIT 1
    )
ORDER BY "createdAt" ASC;