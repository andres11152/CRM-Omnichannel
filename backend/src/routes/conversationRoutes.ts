import express from "express";
import {
  listConversations,
  getConversation,
  replyToConversation,
  updateTags,
  createConversation,
} from "../controllers/conversationController";
import {
  getGroupParticipants,
  addParticipantToCRM,
  addBulkParticipantsToCRM,
  addAllValidParticipantsToCRM,
} from "../controllers/groupContactController";
import { protect } from "../middleware/authMiddleware";

const router = express.Router();

router.use(protect);

router.route("/").get(listConversations).post(createConversation);
// 🛡️ Group Participant Routes (Enterprise Feature)
// MUST be defined BEFORE /:id generic handler to avoid route conflict
router.route("/:id/participants").get(getGroupParticipants);
router.route("/:id/participants/add-to-crm").post(addParticipantToCRM);
router.route("/:id/participants/add-bulk").post(addBulkParticipantsToCRM);
router.route("/:id/participants/add-all").post(addAllValidParticipantsToCRM);

router.route("/:id").get(getConversation);
router.route("/:id/reply").post(replyToConversation);
router.route("/:id/tags").patch(updateTags);

export default router;
