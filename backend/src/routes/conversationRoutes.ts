import express from "express";
import {
  listConversations,
  getConversation,
  replyToConversation,
  updateTags,
  createConversation,
  toggleGroupSync,
  reactToMessage,
  syncFullHistory,
  retryMediaDownload
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
  ReactToMessageSchema,
  RetryMediaSchema,
} from "../schemas/conversationSchemas";
import {
  GetGroupParticipantsSchema,
  AddParticipantToCRMSchema,
  AddBulkParticipantsSchema,
  ConversationIdParamSchema,
} from "../schemas/whatsappSchema";

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(listConversations)
  .post(validate(CreateConversationSchema), createConversation);

// [SEC] Group Participant Routes (Enterprise Feature)
// MUST be defined BEFORE /:id generic handler to avoid route conflict
router
  .route("/:id/participants")
  .get(validate(GetGroupParticipantsSchema), getGroupParticipants);
router
  .route("/:id/participants/add-to-crm")
  .post(validate(AddParticipantToCRMSchema), addParticipantToCRM);
router
  .route("/:id/participants/add-bulk")
  .post(validate(AddBulkParticipantsSchema), addBulkParticipantsToCRM);
router
  .route("/:id/participants/add-all")
  .post(validate(GetGroupParticipantsSchema), addAllValidParticipantsToCRM);

router.route("/:id").get(validate(ConversationIdParamSchema), getConversation);
router
  .route("/:id/reply")
  .post(validate(ReplyToConversationSchema), replyToConversation);
router.route("/:id/tags").patch(validate(UpdateTagsSchema), updateTags);
router
  .route("/:id/toggle-sync")
  .patch(validate(ConversationIdParamSchema), toggleGroupSync);

router
  .route("/:id/sync")
  .post(validate(ConversationIdParamSchema), syncFullHistory);

router
  .route("/:id/messages/:messageId/react")
  .post(validate(ReactToMessageSchema), reactToMessage);

router
  .route("/:id/messages/:messageId/retry-media")
  .post(validate(RetryMediaSchema), retryMediaDownload);

export default router;
