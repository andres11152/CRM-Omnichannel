import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import * as whatsappController from "@/controllers/whatsappController";
import * as chatSyncController from "@/controllers/chatSyncController";

import {
  TriggerSyncSchema,
  SyncConversationSchema,
} from "@/schemas/chatSyncSchema";

const router = Router();

router.use(protect);

router.post(
  "/sessions",
  checkPlanLimit("whatsapp_sessions"),
  whatsappController.createSession,
);
router.get("/sessions", whatsappController.getSessions);
router.delete("/sessions/:sessionId", whatsappController.deleteSession);
router.patch("/sessions/:sessionId", whatsappController.updateSession);
router.post(
  "/sessions/:sessionId/reconnect",
  whatsappController.reconnectSession,
);

// 🔄 CHAT SYNC ROUTES
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

