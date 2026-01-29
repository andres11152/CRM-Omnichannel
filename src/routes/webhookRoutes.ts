import express from "express";
import {
  handleWhatsappWebhook,
  verifyMetaWebhook,
  getCompanyWebhooks,
  createWebhook,
  deleteWebhook,
  toggleWebhook,
  getWebhookLogs,
  getSigningSecret,
} from "@/controllers/webhookController";

const router = express.Router();

/**
 * WEBHOOK ROUTES
 * Public endpoints for external services to push data
 */

// Generic WhatsApp Webhook
router.post("/whatsapp/:companyId", handleWhatsappWebhook);

// Meta/Facebook Webhook Verification
router.get("/meta/:companyId", verifyMetaWebhook);

// 🛠️ WEBHOOK MANAGEMENT (CRUD)
router.get("/", getCompanyWebhooks); // LIST
router.post("/", createWebhook); // CREATE
router.delete("/:id", deleteWebhook); // DELETE
router.patch("/:id/toggle", toggleWebhook); // TOGGLE

router.get("/logs", getWebhookLogs);
router.get("/secret", getSigningSecret);

export default router;
