import { Router } from "express";
import {
  healthCheckHandler,
  livenessProbe,
  readinessProbe,
} from "@/utils/healthCheck";
import { metricsHandler } from "@/utils/metrics";
import { protect } from "@/middleware/authMiddleware";
import { getCsrfTokenHandler } from "@/middleware/csrfMiddleware";
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

// ==================== PROTECTED ROUTES ====================

// Admin
router.use(
  "/api/admin",
  protect,
  superAdminGuard,
  adminRateLimiter,
  adminRouter,
);

// Core Modules
router.use("/api/users", userRateLimiter, protect, userRouter);
router.use("/api/roles", apiLimiter, protect, rolesRouter);
router.use("/api/company", apiLimiter, protect, companyRouter);
router.use("/api/usage", apiLimiter, protect, usageRouter);
router.use("/api/api-keys", apiLimiter, protect, apiKeyRouter);
router.use("/api/webhooks", apiLimiter, protect, webhookRouter);
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
