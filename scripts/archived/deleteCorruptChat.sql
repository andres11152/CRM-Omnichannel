-- Delete corrupt conversation and user with wrong phone number
-- Fixed order to handle foreign keys correctly
-- 1. Delete messages from corrupt conversation
DELETE FROM "messages"
WHERE "conversationId" = 'cmizdbj31000db11o65wf1uzd';
-- 2. Delete messages sent by corrupt user
DELETE FROM "messages"
WHERE "senderId" = 'cmizdbhze000bb11opsel5aim';
-- 3. Delete the corrupt conversation
DELETE FROM "conversations"
WHERE id = 'cmizdbj31000db11o65wf1uzd';
-- 4. Delete the user with incorrect phone number
DELETE FROM "users"
WHERE email = '45908938997905@whatsapp.user';
SELECT 'Corrupt chat deleted successfully!' as result;