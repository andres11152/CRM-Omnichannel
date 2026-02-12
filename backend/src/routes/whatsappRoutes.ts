import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";
import * as whatsappController from "@/controllers/whatsappController";
import * as chatSyncController from "@/controllers/chatSyncController";

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
router.post("/sync", chatSyncController.triggerSync);
router.get("/sync/status", chatSyncController.getSyncStatus);
router.post("/sync/quick", chatSyncController.quickSync);
router.post("/sync/conversation/:phone", chatSyncController.syncConversation);

export default router;
