-- Create LID mapping for 45908938997905 -> 573242450628
INSERT INTO "whatsapp_credentials" (
        "id",
        "sessionId",
        "key",
        "value",
        "createdAt",
        "updatedAt"
    )
VALUES (
        gen_random_uuid(),
        'session_cmixkc2qp00014m7t4kc2sv34_1765331090587',
        'lid-mapping-45908938997905',
        '{"pn":"573242450628"}',
        NOW(),
        NOW()
    ) ON CONFLICT ("sessionId", "key") DO
UPDATE
SET "value" = '{"pn":"573242450628"}',
    "updatedAt" = NOW();
SELECT 'LID mapping created successfully!' as result;