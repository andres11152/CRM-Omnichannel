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
import { CreatePostSchema, UpdatePostSchema } from "@/schemas/postSchema";
import { IdParamSchema } from "@/schemas/commonSchemas";

const router = express.Router();

// All routes from here are protected
router.use(protect);

router.route("/").get(getPosts).post(validate(CreatePostSchema), createPost);

router
  .route("/:id")
  .get(validate(IdParamSchema), getPost)
  .patch(validate(UpdatePostSchema), updatePost)
  .delete(validate(IdParamSchema), deletePost);

export default router;
