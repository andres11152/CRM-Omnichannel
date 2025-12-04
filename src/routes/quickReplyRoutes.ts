import express from "express";
import {
  getQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
} from "../controllers/quickReplyController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.use(protect);

router.route("/").get(getQuickReplies).post(createQuickReply);

router.route("/:id").patch(updateQuickReply).delete(deleteQuickReply);

export default router;
