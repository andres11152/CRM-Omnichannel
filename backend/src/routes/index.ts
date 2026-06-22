import { Router } from "express";
import {
  healthCheckHandler,
  livenessProbe,
  readinessProbe,
} from "@/utils/healthCheck";
import { metricsHandler } from "@/utils/metrics";
import { storageService } from "@/services/StorageService";
import { AppError } from "@/utils/AppError";
import { protect } from "@/middleware/authMiddleware";
import { getCsrfTokenHandler } from "@/middleware/csrfMiddleware";
import path from "path";
import fs from "fs";
import os from "os";
import {
  verifyWebhook,
  handleIncomingWebhook,
} from "@/controllers/metaController";
import {
  apiLimiter,
  userRateLimiter,
  authRateLimiter as advancedAuthLimiter,
  adminRateLimiter,
} from "@/middleware/advancedRateLimiter";
import { superAdminGuard } from "@/middleware/superAdminMiddleware";
import { createQueueDashboardRouter } from "@/routes/queueDashboardRoute";
import { validate } from "@/middleware/validationMiddleware";
import { metaIncomingWebhookSchema } from "@/schemas/webhookSchemas";

// Route Imports
import onboardingRouter from "@/routes/onboardingRoutes";
import authRouter from "@/routes/authRoutes";
import userRouter from "@/routes/userRoutes";
import postRouter from "@/routes/postRoutes";
import replyRouter from "@/routes/replyRoutes";
import adminRouter from "@/routes/adminRoutes";
import ticketRouter from "@/routes/ticketRoutes";
import queueRouter from "@/routes/queueRoutes";
import campaignRouter from "@/routes/campaignRoutes";
import tagRouter from "@/routes/tagRoutes";
import flowRouter from "@/routes/flowRoutes";
import conversationRouter from "@/routes/conversationRoutes";
import webhookRouter from "@/routes/webhookRoutes";
import integrationRouter from "@/routes/integrationRoutes";
import whatsappRouter from "@/routes/whatsappRoutes";
import templateRouter from "@/routes/templateRoutes";
import { contactRouter } from "@/routes/contactRoutes";
import mediaRouter from "@/routes/mediaRoutes";
import accountRouter from "@/routes/accountRoutes";
import dealRouter from "@/routes/dealRoutes";
import pipelineRouter from "@/routes/pipelineRoutes";
import stageRouter from "@/routes/stageRoutes";
import activityRouter from "@/routes/activityRoutes";
import departmentRouter from "@/routes/departmentRoutes";
import apiKeyRouter from "@/routes/apiKeyRoutes";
import dashboardRouter from "@/routes/dashboardRoutes";
import aiRouter from "@/routes/aiRoutes";
import quickReplyRouter from "@/routes/quickReplyRoutes";
import usageRouter from "@/routes/usageRoutes";
import googleAuthRouter from "@/routes/googleAuthRoutes";
import companyRouter from "@/routes/companyRoutes";
import analyticsRouter from "@/routes/analyticsRoutes";
import productRouter from "@/routes/productRoutes";
import emailRouter from "@/routes/emailRoutes";
import pushNotificationsRoutes from "@/routes/pushNotifications";
import rolesRouter from "@/routes/roles";
import searchRouter from "@/routes/searchRoutes";
import notificationsRouter from "@/routes/notificationsRoutes";
import paymentRouter from "@/routes/paymentRoutes";
import externalApiRouter from "@/routes/externalApiRoutes";
import routingRouter from "@/routes/routingRoutes";

const router = Router();

// ==================== SYSTEM & MONITORING ====================
router.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API Service is running and healthy.",
    environment: process.env.NODE_ENV || "development",
  });
});

router.get("/health", healthCheckHandler);
router.get("/health/liveness", livenessProbe);
router.get("/health/readiness", readinessProbe);
router.get("/metrics", metricsHandler);

router.get("/api/whatsapp-debug-memory", async (req, res, next) => {
  try {
    const { whatsappService } = await import("@/whatsapp");
    const sessionManager = whatsappService.getSessionManager();
    const memorySessions = sessionManager.getAllMemorySessions();
    res.status(200).json({ status: "success", memorySessions });
  } catch (error) {
    next(error);
  }
});

// ==================== RAW MEDIA PROXY (SYNC) ====================
// Legacy/Synced media URLs are stored directly as S3 keys without DB records.
// This route converts the requested key directly to a secure S3 Signed URL.
router.get(
  "/companies/:companyId/uploads/:filename",
  async (req, res, next) => {
    try {
      const { companyId, filename } = req.params;
      const key = `companies/${companyId}/uploads/${filename}`;
      const signedUrl = await storageService.getSignedUrl(key);
      res.redirect(signedUrl);
    } catch (error) {
      next(new AppError("Archivo no encontrado o expirado", 404));
    }
  },
);

// ==================== LOCAL MEDIA PROXY (DEV MODE) ====================
// Used by LocalStorageService to serve files securely without AWS S3.
router.get("/api/local-media/*", (req, res, next) => {
  try {
    const key = req.params[0];
    const uploadDir = path.join(os.tmpdir(), "omnicrm_uploads");
    const filePath = path.join(uploadDir, key);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(uploadDir)) {
      return next(new AppError("Acceso denegado", 403));
    }

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      next(new AppError("Archivo no encontrado en almacenamiento local", 404));
    }
  } catch (error) {
    next(new AppError("Error sirviendo archivo local", 500));
  }
});

// ==================== SELF-HEALING FALLBACK REDIRECT ====================
// Automatically redirects legacy direct formats (e.g. /companies/...) to the local-media route.
router.get("/companies/*", (req, res) => {
  const filePath = req.params[0];
  res.redirect(`/api/local-media/companies/${filePath}`);
});


// ==================== PUBLIC ROUTES ====================
router.get("/api/csrf-token", protect, getCsrfTokenHandler);
router.use("/api/onboarding", advancedAuthLimiter, onboardingRouter);
router.use("/api/auth", advancedAuthLimiter, authRouter);
router.get("/webhook", verifyWebhook);
router.post(
  "/webhook",
  validate(metaIncomingWebhookSchema),
  handleIncomingWebhook,
);

// ==================== EXTERNAL PUBLIC API ====================
// Authenticated via X-API-Key header only. Strict rate limiting.
router.use("/api/v1/external", externalApiRouter);

// ==================== PROTECTED ROUTES ====================

// Admin
router.use(
  "/api/admin",
  protect,
  superAdminGuard,
  adminRateLimiter,
  adminRouter,
);

// Queue Dashboard (Bull Board) — superadmin only
// UI available at /api/admin/queues/
router.use(
  "/api/admin/queues",
  protect,
  superAdminGuard,
  createQueueDashboardRouter(),
);

// Core Modules
router.use("/api/users", userRateLimiter, protect, userRouter);
router.use("/api/roles", apiLimiter, protect, rolesRouter);
router.use("/api/company", apiLimiter, protect, companyRouter);
router.use("/api/usage", apiLimiter, protect, usageRouter);
router.use("/api/api-keys", apiLimiter, protect, apiKeyRouter);
router.use("/api/routing-config", apiLimiter, protect, routingRouter);
router.use("/api/webhooks", webhookRouter);
router.use("/api/integrations", apiLimiter, protect, integrationRouter);
router.use(
  "/api/push-notifications",
  apiLimiter,
  protect,
  pushNotificationsRoutes,
);
router.use("/api/notifications", apiLimiter, protect, notificationsRouter);

// Communication Modules
router.use("/api/whatsapp", apiLimiter, protect, whatsappRouter);
router.use("/api/emails", apiLimiter, emailRouter);
router.use("/api/conversations", apiLimiter, protect, conversationRouter);
router.use("/api/contacts", apiLimiter, protect, contactRouter);
router.use("/api/media", apiLimiter, mediaRouter);

// Marketing & Automation
router.use("/api/campaigns", apiLimiter, protect, campaignRouter);
router.use("/api/templates", apiLimiter, protect, templateRouter);
router.use("/api/tags", apiLimiter, protect, tagRouter);
router.use("/api/flows", apiLimiter, protect, flowRouter);
router.use("/api/ai", apiLimiter, protect, aiRouter);
router.use("/api/quick-replies", apiLimiter, protect, quickReplyRouter);

// CRM Core
router.use("/api/accounts", apiLimiter, protect, accountRouter);
router.use("/api/deals", apiLimiter, protect, dealRouter);
router.use("/api/pipelines", apiLimiter, protect, pipelineRouter);
// Note: Stage router is usually nested, but keeping direct mapping for legacy support if needed
// Or fix pipelineRouter to mount it. Assuming direct use for now based on server.ts
router.use(
  "/api/pipelines/:pipelineId/stages",
  apiLimiter,
  protect,
  stageRouter,
);
router.use("/api/activities", apiLimiter, protect, activityRouter);
router.use("/api/products", apiLimiter, protect, productRouter);
router.use("/api/payments", paymentRouter);

// Support & Ticketing
router.use("/api/tickets", apiLimiter, protect, ticketRouter);
router.use("/api/queues", apiLimiter, protect, queueRouter);
router.use("/api/departments", apiLimiter, protect, departmentRouter);

// Forum (Community)
router.use("/api/posts", apiLimiter, protect, postRouter);
router.use("/api/replies", apiLimiter, protect, replyRouter);

// Analytics & Search
router.use("/api/dashboard", apiLimiter, protect, dashboardRouter);
router.use("/api/analytics", apiLimiter, protect, analyticsRouter);
router.use("/api/search", apiLimiter, protect, searchRouter);

// External Auth
router.use("/api/google", apiLimiter, googleAuthRouter);

export default router;
