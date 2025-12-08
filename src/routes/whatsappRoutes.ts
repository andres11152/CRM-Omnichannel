import { Router } from "express";
import { protect } from "@/middleware/authMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";
import * as whatsappController from "@/controllers/whatsappController";

const router = Router();

router.use(protect);

router.post(
  "/sessions",
  checkPlanLimit("whatsapp_sessions"),
  whatsappController.createSession
);
router.get("/sessions", whatsappController.getSessions);
router.delete("/sessions/:sessionId", whatsappController.deleteSession);

export default router;
