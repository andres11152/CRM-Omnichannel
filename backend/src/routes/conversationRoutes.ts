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
  retryMediaDownload,
  setConversationArchived,
  setConversationPinned,
  setConversationMuted,
  editMessage,
  revokeMessage,
  setMessageStarred,
} from "../controllers/conversationController";
import {
  getGroupParticipants,
  addParticipantToCRM,
  addBulkParticipantsToCRM,
  addAllValidParticipantsToCRM,
  updateGroupParticipants,
  updateGroupSubject,
  updateGroupDescription,
  updateGroupSetting,
  getGroupInviteCode,
  revokeGroupInviteCode,
  leaveGroup,
} from "../controllers/groupContactController";
import { protect } from "../middleware/authMiddleware";
import { validate } from "../middleware/validationMiddleware";
import {
  CreateConversationSchema,
  ReplyToConversationSchema,
  UpdateTagsSchema,
  ReactToMessageSchema,
  RetryMediaSchema,
  SetConversationArchivedSchema,
  SetConversationPinnedSchema,
  SetConversationMutedSchema,
  EditMessageSchema,
  RevokeMessageSchema,
  SetMessageStarredSchema,
} from "../schemas/conversationSchemas";
import {
  GetGroupParticipantsSchema,
  AddParticipantToCRMSchema,
  AddBulkParticipantsSchema,
  ConversationIdParamSchema,
  UpdateGroupParticipantsSchema,
  UpdateGroupSubjectSchema,
  UpdateGroupDescriptionSchema,
  UpdateGroupSettingSchema,
  GroupIdParamSchema,
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

// [SEC] Real WhatsApp group mutations (not CRM import) — gated server-side
// by WA_ENABLE_GROUP_MANAGEMENT (default off, see GroupManagementHandler.ts)
router
  .route("/:id/group/participants")
  .patch(validate(UpdateGroupParticipantsSchema), updateGroupParticipants);
router
  .route("/:id/group/subject")
  .patch(validate(UpdateGroupSubjectSchema), updateGroupSubject);
router
  .route("/:id/group/description")
  .patch(validate(UpdateGroupDescriptionSchema), updateGroupDescription);
router
  .route("/:id/group/settings")
  .patch(validate(UpdateGroupSettingSchema), updateGroupSetting);
router
  .route("/:id/group/invite-code")
  .get(validate(GroupIdParamSchema), getGroupInviteCode);
router
  .route("/:id/group/invite-code/revoke")
  .post(validate(GroupIdParamSchema), revokeGroupInviteCode);
router
  .route("/:id/group/leave")
  .post(validate(GroupIdParamSchema), leaveGroup);

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

router
  .route("/:id/archive")
  .patch(validate(SetConversationArchivedSchema), setConversationArchived);
router
  .route("/:id/pin")
  .patch(validate(SetConversationPinnedSchema), setConversationPinned);
router
  .route("/:id/mute")
  .patch(validate(SetConversationMutedSchema), setConversationMuted);

router
  .route("/:id/messages/:messageId")
  .patch(validate(EditMessageSchema), editMessage)
  .delete(validate(RevokeMessageSchema), revokeMessage);

router
  .route("/:id/messages/:messageId/star")
  .patch(validate(SetMessageStarredSchema), setMessageStarred);

export default router;
