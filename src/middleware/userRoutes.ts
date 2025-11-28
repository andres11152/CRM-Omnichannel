import express from 'express';
import { getUsers, getUser, updateUser, deleteUser } from '../src/controllers/usersController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Todas las rutas de aquí para abajo están protegidas
router.use(protect);

router
  .route('/')
  .get(getUsers);

router
  .route('/:id')
  .get(getUser)
  .patch(updateUser)
  .delete(deleteUser);

export default router;