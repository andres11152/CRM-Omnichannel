import { Router } from 'express';
import { createReply, getRepliesForPost, updateReply, deleteReply } from '@/controllers/repliesController';
import { validate } from '@/middleware/validationMiddleware';
import { createReplySchema } from '@/middleware/replySchemas';

const router = Router();

router.route('/')
  .post(validate(createReplySchema), createReply);

router.route('/:id').patch(updateReply).delete(deleteReply);
router.route('/post/:postId').get(getRepliesForPost);

export default router;