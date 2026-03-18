-- Quick check: Count messages by mediaType in metadata
SELECT metadata->>'mediaType' as media_type,
    COUNT(*) as count
FROM messages
WHERE "conversationId" = (
        SELECT id
        FROM conversations
        WHERE "channelId" = '573242450628'
        LIMIT 1
    )
GROUP BY metadata->>'mediaType'
ORDER BY count DESC;