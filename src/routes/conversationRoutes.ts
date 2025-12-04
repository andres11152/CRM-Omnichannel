import express from "express";
import {
  listConversations,
  getConversation,
  replyToConversation,
  updateTags,
  createConversation,
} from "../controllers/conversationController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.use(protect);

router.route("/").get(listConversations).post(createConversation);
router.route("/:id").get(getConversation);
router.route("/:id/reply").post(replyToConversation);
router.route("/:id/tags").patch(updateTags);

export default router;
