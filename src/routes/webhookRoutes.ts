import express from "express";
import { webhookController } from "@/controllers/webhookController";

const router = express.Router();

/**
 * WEBHOOK ROUTES
 * Public endpoints for external services to push data
 */

// Generic WhatsApp Webhook
router.post("/whatsapp/:companyId", webhookController.handleWhatsappWebhook);

// Meta/Facebook Webhook Verification
router.get("/meta/:companyId", webhookController.verifyMetaWebhook);

export default router;
