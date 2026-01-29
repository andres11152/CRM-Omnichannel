// 🔍 INITIALIZE TRACING FIRST (before any other imports)
import "./utils/tracing";

import dotenv from "dotenv";
dotenv.config();

import { Logger } from "@/utils/logger";
import { connectDB } from "./config/database";

// 🛡️ VALIDATE ENVIRONMENT VARIABLES (FAIL FAST)
// This MUST happen before any other imports that depend on env vars
import { initEnv } from "./config/env";
try {
  initEnv();
} catch {
  // Error already logged by initEnv, just exit
  process.exit(1);
}

// 🔍 VERIFY HEAP SIZE AT STARTUP
import v8 from "v8";
const heapStats = v8.getHeapStatistics();
const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
Logger.info(`[HEAP] 🧠 Max Heap Limit: ${heapLimitMB}MB`);

if (heapLimitMB < 3000) {
  // Check against ~3GB (allow some overhead variance from 4096)
  Logger.warn(`[HEAP] ⚠️  WARNING: Max Heap Limit is low (${heapLimitMB}MB).`);
  Logger.warn(
    `[HEAP] 💡 Recommendation: Run with --max-old-space-size=4096 for better performance.`,
  );
} else {
  Logger.info(`[HEAP] ✅ Memory configuration looks good.`);
}

// 🛡️ PROFESSIONAL MEMORY MANAGEMENT
// Replaced global.gc() with proper Memory Manager (see bootstrap/MemoryManager.ts)

import express from "express";
import { createServer } from "http";
import path from "path";
import {
  verifyWebhook,
  handleIncomingWebhook,
} from "@/controllers/metaController";
import { gateway } from "@/gateways/socketGateway";
import { globalErrorHandler } from "@/middleware/errorMiddleware";
import { AppError } from "@/utils/AppError";
import { securityMiddleware } from "@/middleware/securityMiddleware";
import { apiLimiter } from "@/middleware/rateLimitMiddleware";
import { connectRedis } from "@/config/redis";
import { prisma } from "@/config/database";
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
import { protect } from "@/middleware/authMiddleware";
import { superAdminGuard } from "@/middleware/superAdminMiddleware";
import { whatsappService } from "@/whatsapp";
import { EventBus } from "@/whatsapp/core/events/EventBus";
import { WhatsAppEventType } from "@/whatsapp/core/events/WhatsAppEvents";
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
import devRouter from "@/routes/devRoutes";
import searchRouter from "@/routes/searchRoutes";
import notificationsRouter from "@/routes/notificationsRoutes";
import { initScheduler } from "@/services/schedulerService";
import {
  requestTimeout,
  slowRequestLogger,
} from "@/middleware/timeoutMiddleware";
import { memoryMonitor } from "@/utils/resourceManager";
import { getCsrfTokenHandler } from "@/middleware/csrfMiddleware";
import { handleImpersonation } from "@/middleware/impersonationMiddleware";
import {
  userRateLimiter,
  authRateLimiter as advancedAuthLimiter,
  adminRateLimiter,
} from "@/middleware/advancedRateLimiter";
import { metricsHandler, metricsMiddleware } from "@/utils/metrics";
import {
  healthCheckHandler,
  livenessProbe,
  readinessProbe,
} from "@/utils/healthCheck";

process.on("uncaughtException", (err: Error) => {
  // Ignorar errores de red triviales que Node a veces no atrapa
  if (
    err.message?.includes("ECONNRESET") ||
    err.message?.includes("ETIMEDOUT") ||
    err.message?.includes("EPIPE") ||
    err.message?.includes("Connection timeout") ||
    err.message?.includes("ENOTFOUND") ||
    err.message?.includes("getaddrinfo")
  ) {
    Logger.warn(`[Network] ⚠️ Network glitch detected: ${err.message}`);
    return;
  }

  Logger.error("UNCAUGHT EXCEPTION! 💥", err);

  // Don't exit for known non-critical errors
  const errorMessage = err.message?.toLowerCase() || "";
  const isCritical =
    errorMessage.includes("listen eaddrinuse") || // Port already in use
    errorMessage.includes("cannot start") ||
    (errorMessage.includes("database") && !errorMessage.includes("session"));

  if (isCritical) {
    Logger.error("Critical error detected. Shutting down...");
    process.exit(1);
  } else {
    Logger.warn("Non-critical error. Server will continue running.");
  }
});

process.on("unhandledRejection", (reason: unknown) => {
  // Silence network noise in promises
  let msg = "Unknown Error";
  if (reason instanceof Error) {
    msg = reason.message;
  } else {
    msg = String(reason);
  }

  if (
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Socket closed") ||
    msg.includes("Connection timeout") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("getaddrinfo")
  ) {
    Logger.warn(`[Network] ⚠️ Promise network glitch: ${msg}`);
    return;
  }

  Logger.error("UNHANDLED REJECTION! 🔥", reason);

  // Log but don't exit - let the server continue
  Logger.warn("Promise rejection handled. Server continues.");
});

const app = express();
const httpServer = createServer(app);

app.set("trust proxy", 1);
securityMiddleware(app);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "public", "uploads")),
);

// 🛡️ CRITICAL: Request timeout protection
app.use(requestTimeout({ timeout: 30000 })); // 30 seconds

// 🛡️ Performance monitoring
app.use(slowRequestLogger(2000)); // Log requests >2s

// 📊 OBSERVABILITY: Structured HTTP logging
import { httpLogger } from "@/middleware/httpLogger";
app.use(httpLogger);

// 🛡️ SECURITY: Handle impersonation tokens from header (not URL)
app.use(handleImpersonation);

// 📊 METRICS: Track all HTTP requests
app.use(metricsMiddleware);

app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API Service is running and healthy.",
    environment: process.env.NODE_ENV || "development",
  });
});

// 🛡️ Professional health check endpoints
app.get("/health", healthCheckHandler);
app.get("/health/liveness", livenessProbe);
app.get("/health/readiness", readinessProbe);

// 📊 Prometheus metrics endpoint
app.get("/metrics", metricsHandler);

// 🛡️ SECURITY: CSRF Token endpoint (must be authenticated)
app.get("/api/csrf-token", protect, getCsrfTokenHandler);

// Mounted with ADVANCED auth rate limiter (per-user)
app.use("/api/onboarding", advancedAuthLimiter, onboardingRouter);
app.get("/webhook", verifyWebhook);
app.post("/webhook", handleIncomingWebhook);
app.use("/api/auth", advancedAuthLimiter, authRouter);

// 🛡️ SECURITY: Admin routes with strict rate limiting
app.use("/api/admin", protect, superAdminGuard, adminRateLimiter, adminRouter);

// 🛡️ SECURITY: User-specific rate limiting on all protected routes
app.use("/api/users", userRateLimiter, protect, userRouter);
app.use("/api/posts", apiLimiter, protect, postRouter);
app.use("/api/replies", apiLimiter, protect, replyRouter);
app.use("/api/tickets", apiLimiter, protect, ticketRouter);
app.use("/api/queues", apiLimiter, protect, queueRouter);
app.use("/api/campaigns", apiLimiter, protect, campaignRouter);
app.use("/api/tags", apiLimiter, protect, tagRouter);
app.use("/api/flows", apiLimiter, protect, flowRouter);
app.use("/api/conversations", apiLimiter, protect, conversationRouter);
app.use("/api/webhooks", apiLimiter, protect, webhookRouter);
app.use("/api/api-keys", apiLimiter, protect, apiKeyRouter);
app.use("/api/integrations", apiLimiter, protect, integrationRouter);

app.use("/api/whatsapp", apiLimiter, protect, whatsappRouter);
app.use("/api/templates", apiLimiter, protect, templateRouter);
app.use("/api/contacts", apiLimiter, protect, contactRouter);
app.use("/api/media", apiLimiter, mediaRouter);
app.use("/api/accounts", apiLimiter, protect, accountRouter);
app.use("/api/deals", apiLimiter, protect, dealRouter);
app.use("/api/pipelines", apiLimiter, protect, pipelineRouter);
app.use("/api/pipelines/:pipelineId/stages", apiLimiter, protect, stageRouter);
app.use("/api/activities", apiLimiter, protect, activityRouter);
app.use("/api/departments", apiLimiter, protect, departmentRouter);
app.use("/api/dashboard", apiLimiter, protect, dashboardRouter);
app.use("/api/ai", apiLimiter, protect, aiRouter);
app.use("/api/quick-replies", apiLimiter, protect, quickReplyRouter);
app.use("/api/google", apiLimiter, googleAuthRouter);
app.use("/api/usage", apiLimiter, protect, usageRouter);
app.use("/api/company", apiLimiter, protect, companyRouter);
app.use("/api/analytics", apiLimiter, protect, analyticsRouter);
app.use("/api/products", apiLimiter, protect, productRouter);
app.use("/api/emails", apiLimiter, emailRouter); // Email module
app.use(
  "/api/push-notifications",
  apiLimiter,
  protect,
  pushNotificationsRoutes,
);
app.use("/api/roles", apiLimiter, protect, rolesRouter);
app.use("/api/search", apiLimiter, protect, searchRouter);
app.use("/api/notifications", apiLimiter, protect, notificationsRouter);

// 🛠️ DEV TOOLS (Non-Production Only)
if (process.env.NODE_ENV !== "production") {
  app.use("/api/dev", devRouter);
  Logger.info("[Server] 🧪 Dev Routes enabled at /api/dev");
}

app.use((req, res, next) => {
  next(
    new AppError(
      `No se encontró la ruta '${req.originalUrl}' en este servidor`,
      404,
    ),
  );
});

app.use(globalErrorHandler);

// (Redundant handler removed)

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  const startServer = async () => {
    try {
      // Connect to Redis first (non-blocking failure)
      await connectRedis();

      Logger.info("[Server] 🔧 Connecting to Database...");
      await connectDB();
      Logger.info("[Server] ✅ Database connected successfully");

      Logger.info("[Server] ✅ Database connected successfully");

      Logger.info("[Server] 🔧 Initializing Gateway...");
      await gateway.initialize(httpServer);
      Logger.info("[Server] ✅ Gateway initialized successfully");

      // BRIDGE: WhatsApp Events -> Socket Gateway
      Logger.info("[Server] 🌉 Bridging WhatsApp events to Socket Gateway...");
      const eventBus = EventBus.getInstance();

      eventBus.subscribe(WhatsAppEventType.SESSION_CONNECTED, (event) => {
        gateway.emitToCompany(event.companyId, "session.status", {
          sessionId: event.sessionId,
          status: "CONNECTED",
          phone: event.data.phone, // ✅ Correctly typed access
          timestamp: event.timestamp,
        });
      });

      eventBus.subscribe(WhatsAppEventType.SESSION_DISCONNECTED, (event) => {
        // 🛡️ 100-YEAR FIX: Smart Status Handling
        // Don't scare the user with "Disconnected" if we are just autoreconnecting
        const isReconnecting = event.data?.isReconnecting;
        const status = isReconnecting ? "CONNECTING" : "DISCONNECTED";

        gateway.emitToCompany(event.companyId, "session.status", {
          sessionId: event.sessionId,
          status: status,
          reason: event.data?.reason,
          timestamp: event.timestamp,
        });

        if (isReconnecting) {
          Logger.info(
            `[Server] 🔄 Session ${event.sessionId} reconnecting... (UI: CONNECTING)`,
          );
        }
      });

      eventBus.subscribe(WhatsAppEventType.SESSION_QR_CODE, (event) => {
        gateway.emitToCompany(event.companyId, "qr.updated", {
          sessionId: event.sessionId,
          qr: event.data?.qr,
          timestamp: event.timestamp,
        });
      });

      // 🔥 CRITICAL: Propagate incoming messages to frontend in REAL-TIME
      eventBus.subscribe(WhatsAppEventType.MESSAGE_RECEIVED, (event) => {
        Logger.debug(
          `[Server] 📨 Propagating message to company ${event.companyId}`,
        );
        gateway.emitToCompany(event.companyId, "message.received", {
          message: event.data.message,
          timestamp: event.timestamp,
        });
      });

      // 🟢 PRESENCE UPDATES (Typing indicators)
      eventBus.subscribe(WhatsAppEventType.PRESENCE_UPDATE, (event) => {
        // Debounce log or reduce noise
        // Logger.debug(`[Server] 🟢 Presence update for ${event.companyId}`);
        gateway.emitToCompany(event.companyId, "presence.update", {
          id: event.data.id,
          presences: event.data.presences,
        });
      });

      Logger.info("[Server] ✅ Event Bridge established");

      // 🛡️ 100-YEAR FIX: Sync Status on Connect
      // Ensures frontend gets the current status immediately, even if it connected AFTER the event fired.
      const io = gateway.getIO();
      if (io) {
        io.on("connection", async (socket) => {
          const user = socket.data.user;
          if (user && user.companyId) {
            Logger.debug(
              `[Server] 🔄 Syncing session status for ${user.id} (Company: ${user.companyId})`,
            );
            // Fetch status from Service (Memory First)
            const sessions = await whatsappService.listSessions(user.companyId);

            Logger.debug(
              `[Server] Syncing ${sessions.length} sessions for company ${user.companyId}`,
            );

            // Emit status for each session
            sessions.forEach((session) => {
              socket.emit("session.status", {
                sessionId: session.sessionId,
                status: session.status,
                timestamp: new Date(),
              });
            });

            // ⌨️ TYPING INDICATOR HANDLER (Frontend -> WhatsApp)
            socket.on("conversation:typing", (payload: any) => {
              // Payload: { to: string (phone), status: "composing" | "paused" }
              if (payload?.to && payload?.status) {
                // Fire & Forget for performance
                whatsappService
                  .sendPresenceUpdate(
                    payload.to,
                    payload.status,
                    user.companyId!,
                  )
                  .catch((err) =>
                    Logger.warn(`[Typing] Failed: ${err.message}`),
                  );
              }
            });
          }
        });
      }

      Logger.info("[Server] 🔧 Initializing WhatsApp service...");
      await whatsappService.initialize();
      Logger.info("[Server] ✅ WhatsApp service initialized successfully");

      // 🛡️ Start memory monitoring
      memoryMonitor.start(60000); // Check every minute
      Logger.info("[Server] 🛡️ Memory monitor started");

      // 🚨 AUTO-RESTART: Managed by PM2/Docker (KISS Principle)
      // V8 needs to grow heap dynamically under pressure
      Logger.info(
        "[Server] ⚠️  Auto-restart DISABLED - allowing heap to grow naturally",
      );

      Logger.info("[Server] Workflow Engine initialized");

      Logger.info("[Server] 🔧 Initializing Scheduler...");
      initScheduler();

      // ✅ Initialize Message Queue Workers
      Logger.info("[Server] 🚀 Initializing Message Queue Workers...");
      try {
        const { getMessageQueueWorker } =
          await import("./services/queue/messageQueue.worker");
        // Get singleton instance with whatsappService
        const messageWorker = getMessageQueueWorker(whatsappService);

        // Start workers for all active companies
        const companies = await prisma.company.findMany({
          where: { isActive: true },
        });
        Logger.info(`[Server] Found ${companies.length} active companies`);

        for (const company of companies) {
          Logger.info(
            `[Server] Starting worker for: ${company.name} (${company.id})`,
          );
          // Start the unified 3-concurrent worker
          await messageWorker.startWorker(company.id);
          Logger.info(`[Server] 👷 Worker started for: ${company.name}`);
        }
        Logger.info(
          `[Server] ✅ ${companies.length} message queue workers initialized`,
        );

        // Graceful shutdown handler
        process.on("SIGTERM", async () => {
          Logger.info(
            "[Server] 🛑 SIGTERM received, shutting down gracefully...",
          );
          await messageWorker.shutdown();
          const { messageQueueService } =
            await import("./services/queue/messageQueue.service");
          await messageQueueService.shutdown();
          process.exit(0);
        });
      } catch (workerError: unknown) {
        const msg =
          workerError instanceof Error
            ? workerError.message
            : String(workerError);

        // Handle predictable Redis errors gracefully
        if (
          msg.includes("Connection timeout") ||
          msg.includes("ENOTFOUND") ||
          msg.includes("getaddrinfo") ||
          msg.includes("ETIMEDOUT") ||
          String(msg).toLowerCase().includes("error") // Catch generic errors
        ) {
          Logger.warn(
            `[Server] ⚠️ Redis connection failed for Workers. Running without Message Queues. (Reason: ${msg})`,
          );
        } else {
          Logger.error("[Server] ❌ Failed to initialize workers:");
          Logger.error(workerError as string);
        }
        Logger.info("[Server] ⚠️  Continuing without queue workers...");
      }

      httpServer.listen(Number(PORT), () => {
        Logger.info(
          `✅ ¡ÉXITO! CRM SaaS Backend corriendo en el puerto ${PORT}`,
        );
      });
    } catch (err) {
      Logger.error("[Server] ❌ Critical error during server startup.");
      Logger.error(err);
      process.exit(1);
    }
  };

  startServer();
}

// 🛡️ GRACEFUL SHUTDOWN
const gracefulShutdown = () => {
  Logger.info("🛑 SIGTERM/SIGINT received. Shutting down gracefully...");
  httpServer.close(async () => {
    Logger.info("🔌 HTTP server closed");
    await prisma.$disconnect();
    Logger.info("💾 Database disconnected");
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

export { app, httpServer };
