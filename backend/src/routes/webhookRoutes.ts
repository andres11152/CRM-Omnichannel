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
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { z } from "zod";
import { IdParamSchema } from "@/schemas/commonSchemas";

const CompanyIdParamSchema = z.object({
  params: z.object({ companyId: z.string().cuid() }),
});

const CreateWebhookSchema = z.object({
  body: z.object({
    url: z.string().url(),
    events: z.array(z.string()).min(1),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

const router = express.Router();

/**
 * WEBHOOK ROUTES
 * Public endpoints for external services to push data
 */

// Generic WhatsApp Webhook
router.post(
  "/whatsapp/:companyId",
  validate(CompanyIdParamSchema),
  handleWhatsappWebhook,
);

// Meta/Facebook Webhook Verification
router.get(
  "/meta/:companyId",
  validate(CompanyIdParamSchema),
  verifyMetaWebhook,
);

// [DEV] WEBHOOK MANAGEMENT (CRUD)
// Protect management endpoints
router.use("/", protect);
router.get("/", getCompanyWebhooks); // LIST
router.post("/", validate(CreateWebhookSchema), createWebhook); // CREATE
router.delete("/:id", validate(IdParamSchema), deleteWebhook); // DELETE
router.patch("/:id/toggle", validate(IdParamSchema), toggleWebhook); // TOGGLE

router.get("/logs", getWebhookLogs);
router.get("/secret", getSigningSecret);

export default router;
