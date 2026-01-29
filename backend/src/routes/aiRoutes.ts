import { Router } from "express";
import {
  getAIConfig,
  updateAIConfig,
  getAssistants,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  testAI,
  copilotAction,
} from "@/controllers/aiController";
import { protect } from "@/middleware/authMiddleware";
import { checkPlanLimit } from "@/middleware/planLimitsMiddleware";

const router = Router();

router.use(protect);

// Config (API Keys)
router.get("/config", getAIConfig);
router.put("/config", updateAIConfig);

// Assistants (Personas)
router.get("/assistants", getAssistants);
router.post("/assistants", checkPlanLimit("ai_assistants"), createAssistant);
router.put("/assistants/:id", updateAssistant);
router.delete("/assistants/:id", deleteAssistant);

// Test
router.post("/test", testAI);

// Copilot
router.post("/copilot", copilotAction);

export default router;
