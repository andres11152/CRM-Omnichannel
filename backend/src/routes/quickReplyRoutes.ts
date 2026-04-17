import express from "express";
import {
  getQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
} from "../controllers/quickReplyController";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  CreateQuickReplySchema,
  UpdateQuickReplySchema,
  QuickReplyIdParamSchema,
} from "../schemas/quickReplySchema";

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(getQuickReplies)
  .post(validate(CreateQuickReplySchema), createQuickReply);

router
  .route("/:id")
  .patch(validate(UpdateQuickReplySchema), updateQuickReply)
  .delete(validate(QuickReplyIdParamSchema), deleteQuickReply);

export default router;
