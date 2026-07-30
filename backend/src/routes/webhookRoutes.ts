import express from "express";
import {
  handleWhatsappWebhook,
  verifyMetaWebhook,
  getCompanyWebhooks,
  createWebhook,
  deleteWebhook,
  getWebhookLogs,
  getSigningSecret,
  toggleWebhook,
  replayLog,
} from "@/controllers/webhookController";
import { protect } from "@/middleware/authMiddleware";
import { validate } from "@/middleware/validationMiddleware";
import { z } from "zod";
import { IdParamSchema } from "@/schemas/commonSchemas";

const CompanyIdParamSchema = z.object({
  params: z.object({ companyId: z.string().min(1) }),
});

const router = express.Router();

// ── Public endpoints for external services ──────────────────────────────────

router.post(
  "/whatsapp/:companyId",
  validate(CompanyIdParamSchema),
  handleWhatsappWebhook,
);

router.get(
  "/meta/:companyId",
  validate(CompanyIdParamSchema),
  verifyMetaWebhook,
);

// Global multi-tenant Meta webhooks
import {
  verifyMetaWebhook as verifyGlobalMeta,
  handleMetaWebhookEvent,
} from "@/controllers/metaWebhookController";
import { verifyMetaWebhookSignature } from "@/middleware/webhookVerifyMiddleware";

router.get("/meta", verifyGlobalMeta);
router.post("/meta", verifyMetaWebhookSignature, handleMetaWebhookEvent);

// Global multi-tenant Instagram DM webhooks
import {
  verifyInstagramWebhook,
  handleInstagramWebhookEvent,
} from "@/controllers/instagramWebhookController";

router.get("/instagram", verifyInstagramWebhook);
router.post("/instagram", verifyMetaWebhookSignature, handleInstagramWebhookEvent);

// Resend email tracking webhook (delivered/opened/clicked/bounced/spam)
import { handleResendWebhook } from "@/controllers/emailController";
import { verifyResendWebhookSignature } from "@/middleware/resendWebhookVerifyMiddleware";

router.post("/email/resend", verifyResendWebhookSignature, handleResendWebhook);

// ── Protected management endpoints ──────────────────────────────────────────

router.use("/", protect);

router.get("/", getCompanyWebhooks);
router.post("/", createWebhook);
router.delete("/:id", validate(IdParamSchema), deleteWebhook);
router.patch("/:id/toggle", validate(IdParamSchema), toggleWebhook);

router.get("/logs", getWebhookLogs);
router.post("/logs/:id/retry", validate(IdParamSchema), replayLog);
router.get("/secret", getSigningSecret);

export default router;
