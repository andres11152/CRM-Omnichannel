import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { requestTimeout } from "@/middleware/timeoutMiddleware";
import * as whatsappController from "@/controllers/whatsappController";
import * as chatSyncController from "@/controllers/chatSyncController";

import {
  TriggerSyncSchema,
  SyncConversationSchema,
} from "@/schemas/chatSyncSchema";
import {
  SessionIdParamSchema,
  UpdateSessionSchema,
  RequestPairingCodeSchema,
  UpdateProfileNameSchema,
  UpdateProfilePictureSchema,
} from "@/schemas/whatsappSchema";

const router = Router();

router.use(protect);

router.post(
  "/sessions",
  // [SEC] Override global 30s timeout: QR generation + Baileys init can take up to 20s.
  requestTimeout({ timeout: 60000 }),
  checkPlanLimit("whatsapp_sessions"),
  whatsappController.createSession,
);
router.post(
  "/sessions/pairing-code",
  requestTimeout({ timeout: 60000 }),
  checkPlanLimit("whatsapp_sessions"),
  validate(RequestPairingCodeSchema),
  whatsappController.requestPairingCode,
);
router.get("/sessions", whatsappController.getSessions);
router.delete(
  "/sessions/:sessionId",
  validate(SessionIdParamSchema),
  whatsappController.deleteSession,
);
router.patch(
  "/sessions/:sessionId",
  validate(UpdateSessionSchema),
  whatsappController.updateSession,
);
router.post(
  "/sessions/:sessionId/reconnect",
  validate(SessionIdParamSchema),
  whatsappController.reconnectSession,
);
router.patch(
  "/sessions/:sessionId/profile-name",
  validate(UpdateProfileNameSchema),
  whatsappController.updateProfileName,
);
router.patch(
  "/sessions/:sessionId/profile-picture",
  validate(UpdateProfilePictureSchema),
  whatsappController.updateProfilePicture,
);

// [SYNC] CHAT SYNC ROUTES
router.post(
  "/sync",
  validate(TriggerSyncSchema),
  chatSyncController.triggerSync,
);
router.get("/sync/status", chatSyncController.getSyncStatus);
router.post("/sync/quick", chatSyncController.quickSync);
router.post(
  "/sync/conversation/:phone",
  validate(SyncConversationSchema),
  chatSyncController.syncConversation,
);

export default router;
