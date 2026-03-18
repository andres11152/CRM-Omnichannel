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
import { validate } from "@/middleware/validationMiddleware";
import {
  UpdateAIConfigSchema,
  CreateAssistantSchema,
  UpdateAssistantSchema,
  IdParamSchema,
  TestAISchema,
  CopilotActionSchema,
} from "@/schemas/commonSchemas";

const router = Router();

router.use(protect);

// Config (API Keys)
router.get("/config", getAIConfig);
router.put("/config", validate(UpdateAIConfigSchema), updateAIConfig);

// Assistants (Personas)
router.get("/assistants", getAssistants);
router.post(
  "/assistants",
  checkPlanLimit("ai_assistants"),
  validate(CreateAssistantSchema),
  createAssistant,
);
router.put("/assistants/:id", validate(UpdateAssistantSchema), updateAssistant);
router.delete("/assistants/:id", validate(IdParamSchema), deleteAssistant);

// Test
router.post("/test", validate(TestAISchema), testAI);

// Copilot
router.post("/copilot", validate(CopilotActionSchema), copilotAction);

export default router;
