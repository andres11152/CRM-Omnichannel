import { Router } from "express";
import {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  createUser,
} from "@/controllers/usersController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { z } from "zod";

const router = Router();

// Todas las rutas de aquí para abajo están protegidas
router.use(protect);

router.route("/").get(getUsers).post(createUser);

const updateUserSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre no puede estar vacío.").optional(),
    email: z.string().email("Email no válido.").optional(),
  }),
});

router
  .route("/:id")
  .get(getUser)
  .patch(validate(updateUserSchema), updateUser)
  .delete(deleteUser);

export default router;
