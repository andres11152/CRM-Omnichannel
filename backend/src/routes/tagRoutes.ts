import express from "express";
import { createTag, getTags, deleteTag } from "@/controllers/tagController";
import { protect } from "@/middleware/authMiddleware";
import { restrictTo } from "@/middleware/restrictTo";
import { validate } from "@/middleware/validationMiddleware";
import { CreateTagSchema, DeleteTagSchema } from "@/schemas/tagSchema";

const router = express.Router();

router.use(protect);

//  ALL AUTHENTICATED USERS can view tags (Agents need this for chat tagging)
router.get("/", getTags);

//  ADMIN+ ONLY: Create and Delete tags (Agents should NOT pollute the tag catalog)
router.post(
  "/",
  restrictTo("ADMIN", "SUPERVISOR", "MASTER"),
  validate(CreateTagSchema),
  createTag,
);
router.delete(
  "/:id",
  restrictTo("ADMIN", "SUPERVISOR", "MASTER"),
  validate(DeleteTagSchema),
  deleteTag,
);

export default router;

