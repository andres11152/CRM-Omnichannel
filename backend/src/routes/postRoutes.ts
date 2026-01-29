import express from 'express';
import { getPosts, createPost, getPost, updatePost, deletePost } from '@/controllers/postsController';
import { protect } from '@/middleware/authMiddleware';
import { validate } from '@/middleware/validationMiddleware';
import { z } from 'zod';

const router = express.Router();

// Todas las rutas a partir de aquí están protegidas
router.use(protect);

const createPostSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'El contenido no puede estar vacío.'),
    // authorId se tomará del usuario autenticado (req.user), no del body.
  }),
});

router.route('/')
  .get(getPosts)
  .post(validate(createPostSchema), createPost);

router.route('/:id')
  .get(getPost)
  .patch(updatePost)
  .delete(deletePost);

export default router;