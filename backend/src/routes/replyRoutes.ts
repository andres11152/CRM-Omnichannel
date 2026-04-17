import { Router } from 'express';
import { createReply, getRepliesForPost, updateReply, deleteReply } from '@/controllers/repliesController';
import { validate } from '@/middleware/validationMiddleware';
import { CreateReplySchema } from '@/schemas/replySchema';

const router = Router();

router.route('/')
  .post(validate(CreateReplySchema), createReply);

router.route('/:id').patch(updateReply).delete(deleteReply);
router.route('/post/:postId').get(getRepliesForPost);

export default router;