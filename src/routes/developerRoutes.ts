import { Router } from "express";
import { protect } from "@/middleware/auth";
import { webhookController } from "@/controllers/webhookController";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from "@/controllers/apiKeyController";

const router = Router();

router.use(protect);

// Webhooks
router.get("/webhooks", webhookController.getCompanyWebhooks);
router.post("/webhooks", webhookController.createWebhook);
router.delete("/webhooks/:id", webhookController.deleteWebhook);
router.patch("/webhooks/:id/toggle", webhookController.toggleWebhook);

// API Keys
router.get("/api-keys", listApiKeys);
router.post("/api-keys", createApiKey);
router.delete("/api-keys/:id", revokeApiKey);

export default router;
