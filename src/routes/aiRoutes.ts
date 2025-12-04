import { Router } from "express";
import {
  getAIConfig,
  updateAIConfig,
  getAssistants,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  testAI,
} from "@/controllers/aiController";
import { protect } from "@/middleware/authMiddleware";

const router = Router();

router.use(protect);

// Config (API Keys)
router.get("/config", getAIConfig);
router.put("/config", updateAIConfig);

// Assistants (Personas)
router.get("/assistants", getAssistants);
router.post("/assistants", createAssistant);
router.put("/assistants/:id", updateAssistant);
router.delete("/assistants/:id", deleteAssistant);

// Test
router.post("/test", testAI);

export default router;
