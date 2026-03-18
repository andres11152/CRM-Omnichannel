-- 🧹 FULL CLEANUP: Delete all synced data for fresh test
-- Order matters: child tables first to respect FK constraints
-- 1. Delete all messages
DELETE FROM messages;
-- 2. Delete all tickets  
DELETE FROM tickets;
-- 3. Delete all conversations
DELETE FROM conversations;
-- 4. Delete WhatsApp credentials (auth state)
DELETE FROM whatsapp_credentials;
-- 5. Delete WhatsApp sessions
DELETE FROM whatsapp_sessions;