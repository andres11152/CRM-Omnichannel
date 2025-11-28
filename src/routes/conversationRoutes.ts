
import express from 'express';
import { listConversations, getConversation, replyToConversation } from '../controllers/conversationController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.use(protect);

router.route('/').get(listConversations);
router.route('/:id').get(getConversation);
router.route('/:id/reply').post(replyToConversation);

export default router;
