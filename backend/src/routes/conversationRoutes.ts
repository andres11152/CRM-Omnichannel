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
import { validate } from "../middleware/validationMiddleware";
import {
  CreateConversationSchema,
  ReplyToConversationSchema,
  UpdateTagsSchema,
} from "../schemas/conversationSchemas";

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(listConversations)
  .post(validate(CreateConversationSchema), createConversation);
// 🛡️ Group Participant Routes (Enterprise Feature)
// MUST be defined BEFORE /:id generic handler to avoid route conflict
router.route("/:id/participants").get(getGroupParticipants);
router.route("/:id/participants/add-to-crm").post(addParticipantToCRM);
router.route("/:id/participants/add-bulk").post(addBulkParticipantsToCRM);
router.route("/:id/participants/add-all").post(addAllValidParticipantsToCRM);

router.route("/:id").get(getConversation);
router
  .route("/:id/reply")
  .post(validate(ReplyToConversationSchema), replyToConversation);
router.route("/:id/tags").patch(validate(UpdateTagsSchema), updateTags);

export default router;
