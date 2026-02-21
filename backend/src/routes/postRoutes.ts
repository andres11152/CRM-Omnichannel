import express from "express";
import {
  getPosts,
  createPost,
  getPost,
  updatePost,
  deletePost,
} from "@/controllers/postsController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { CreatePostSchema, UpdatePostSchema } from "@/schemas/post.schema";

const router = express.Router();

// Todas las rutas a partir de aquí están protegidas
router.use(protect);

router.route("/").get(getPosts).post(validate(CreatePostSchema), createPost);

router
  .route("/:id")
  .get(getPost)
  .patch(validate(UpdatePostSchema), updatePost)
  .delete(deletePost);

export default router;
