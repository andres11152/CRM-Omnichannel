// import 'module-alias/register';
import dotenv from "dotenv";
dotenv.config();

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
import { Logger } from "@/utils/logger";
import { securityMiddleware } from "@/middleware/securityMiddleware";
import { apiLimiter, authLimiter } from "@/middleware/rateLimitMiddleware";
import { connectRedis } from "@/config/redis";
import { registerCompany } from "@/controllers/onboardingController";
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
import { whatsappService } from "@/services/whatsapp.service";
import whatsappRouter from "@/routes/whatsappRoutes";
import templateRouter from "@/routes/templateRoutes";
import { contactRouter } from "@/routes/contactRoutes";
import mediaRouter from "@/routes/mediaRoutes";
import accountRouter from "@/routes/accountRoutes";
import dealRouter from "@/routes/dealRoutes";
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

process.on("uncaughtException", (err: Error) => {
  Logger.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  Logger.error(err);
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);

app.set("trust proxy", 1);
securityMiddleware(app);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "public", "uploads"))
);

app.use((req, res, next) => {
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API Service is running and healthy.",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API Service is healthy.",
  });
});

app.post("/api/onboarding", authLimiter, registerCompany);
app.get("/webhook", verifyWebhook);
app.post("/webhook", handleIncomingWebhook);
app.use("/api/auth", authLimiter, authRouter);

app.use("/api/admin", protect, superAdminGuard, adminRouter);

app.use("/api/users", apiLimiter, protect, userRouter);
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
app.use("/api/media", apiLimiter, protect, mediaRouter);
app.use("/api/accounts", apiLimiter, protect, accountRouter);
app.use("/api/deals", apiLimiter, protect, dealRouter);
app.use("/api/activities", apiLimiter, protect, activityRouter);
app.use("/api/departments", apiLimiter, protect, departmentRouter);
app.use("/api/dashboard", apiLimiter, protect, dashboardRouter);
app.use("/api/ai", apiLimiter, protect, aiRouter);
app.use("/api/quick-replies", apiLimiter, protect, quickReplyRouter);
app.use("/api/google", apiLimiter, googleAuthRouter);
app.use("/api/usage", apiLimiter, protect, usageRouter);
app.use("/api/company", apiLimiter, protect, companyRouter);
app.use("/api/analytics", apiLimiter, protect, analyticsRouter);

app.use((req, res, next) => {
  next(
    new AppError(
      `No se encontró la ruta '${req.originalUrl}' en este servidor`,
      404
    )
  );
});

app.use(globalErrorHandler);

(process as any).on("unhandledRejection", (reason: any) => {
  Logger.error("UNHANDLED REJECTION! 💥 Shutting down...");
  if (reason instanceof Error) {
    Logger.error(reason);
  } else {
    Logger.error(new Error(`Promise rejected with non-error value: ${reason}`));
  }

  httpServer.close(() => {
    process.exit(1);
  });
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  const startServer = async () => {
    try {
      // Connect to Redis first (non-blocking failure)
      await connectRedis();

      console.log("[Server] 🔧 Initializing WhatsApp service...");
      await whatsappService.initialize();
      console.log("[Server] ✅ WhatsApp service initialized successfully");

      console.log("[Server] 🔧 Initializing Gateway...");
      await gateway.initialize(httpServer);
      console.log("[Server] ✅ Gateway initialized successfully");

      console.log("[Server] Workflow Engine initialized");

      httpServer.listen(Number(PORT), () => {
        console.log(
          `✅ ¡ÉXITO! CRM SaaS Backend corriendo en el puerto ${PORT}`
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

export { app, httpServer };
