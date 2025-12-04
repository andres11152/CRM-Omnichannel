// import 'module-alias/register'; // Ya no es necesario, se carga con el script 'start'

// --- LOAD ENVIRONMENT VARIABLES ---
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
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

// --- NEW IMPORTS ---
// import { stripeWebhook } from '@/controllers/paymentController'; // Deshabilitado para v1.0
import { registerCompany } from "@/controllers/onboardingController";
import authRouter from "@/routes/authRoutes";
import userRouter from "@/routes/userRoutes";
import postRouter from "@/routes/postRoutes";
import replyRouter from "@/routes/replyRoutes";
import adminRouter from "@/routes/adminRoutes";
import ticketRouter from "@/routes/ticketRoutes"; // Importar el nuevo router de tickets
import queueRouter from "@/routes/queueRoutes"; // Importar el nuevo router de colas
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
import { workflowEngine } from "@/services/workflowEngine";

// HANDLE UNCAUGHT EXCEPTIONS (Sync Errors)
(process as any).on("uncaughtException", (err: Error) => {
  Logger.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  Logger.error(err); // Usar el logger y loguear el objeto completo
  process.exit(1); // Salir después de loguear
});

const app = express();
const httpServer = createServer(app);

// --- STRIPE WEBHOOK (Must be before JSON parser) ---
// app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook); // Deshabilitado para v1.0

// Configurar Express para que confíe en el proxy inverso (ej. Nginx, Heroku, etc.)
// Esto es crucial para que el rate-limiting funcione correctamente con req.ip.
app.set("trust proxy", 1);

// --- SECURITY & PARSING ---
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
// Aplicamos Helmet y CORS. El Rate Limiting se aplicará por ruta.
// Es crucial que securityMiddleware NO aplique un rate-limiter global.
securityMiddleware(app);

// --- STATIC FILE SERVING FOR LOCAL MEDIA ---
import path from "path";
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// --- HTTP LOGGER ---
app.use((req, res, next) => {
  Logger.http(`${req.method} ${req.url}`);
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
// --- PUBLIC ROUTES ---
app.post("/api/onboarding", authLimiter, registerCompany); // Usamos app.post para ser explícitos
app.get("/webhook", verifyWebhook);
app.post("/webhook", handleIncomingWebhook);
app.use("/api/auth", authLimiter, authRouter); // Aplicamos el limiter de auth

// --- ADMIN ROUTES (Super Admin Only) ---
// Movemos esto aquí temporalmente para descartar conflictos de enrutamiento.
app.use("/api/admin", protect, superAdminGuard, adminRouter);

// --- PROTECTED ROUTES ---
// Todas las rutas definidas en los siguientes routers requerirán un token JWT
app.use("/api/users", apiLimiter, protect, userRouter);
app.use("/api/posts", apiLimiter, protect, postRouter);
app.use("/api/replies", apiLimiter, protect, replyRouter);
app.use("/api/tickets", apiLimiter, protect, ticketRouter); // Añadir la ruta de tickets para usuarios autenticados
app.use("/api/queues", apiLimiter, protect, queueRouter); // Añadir la ruta de colas para usuarios autenticados
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
// app.post('/api/create-checkout-session', apiLimiter, protect, validate(createCheckoutSessionSchema), createCheckoutSession);
// app.post('/api/create-portal-session', apiLimiter, protect, createPortalSession);

// --- 404 HANDLER ---
// Middleware para capturar todas las rutas no encontradas. Debe ir después de todas las demás rutas.
app.use((req, res, next) => {
  next(
    new AppError(
      `No se encontró la ruta '${req.originalUrl}' en este servidor`,
      404
    )
  );
});

// --- GLOBAL ERROR HANDLER (Must be last) ---
app.use(globalErrorHandler);

// HANDLE UNHANDLED REJECTIONS (Async Errors)
(process as any).on("unhandledRejection", (reason: any) => {
  Logger.error("UNHANDLED REJECTION! 💥 Shutting down...");
  // Asegurarnos de que siempre logueamos un objeto Error para tener un stack trace
  if (reason instanceof Error) {
    Logger.error(reason);
  } else {
    Logger.error(new Error(`Promise rejected with non-error value: ${reason}`));
  }

  httpServer.close(() => {
    process.exit(1);
  });
});

// --- SERVER INITIALIZATION ---
const PORT = process.env.PORT || 4000;

// Solo inicia el servidor si el archivo se ejecuta directamente (no durante las pruebas)
if (require.main === module) {
  const startServer = async () => {
    try {
      // Inicializa los servicios antes de escuchar
      try {
        await whatsappService.initialize();
        Logger.info("[Server] WhatsApp service initialized successfully");
      } catch (e) {
        Logger.error(`[Server] WhatsApp init error: ${e}`);
      }
      // Logger.warn("[Server] WhatsApp initialization temporarily disabled");

      await gateway.initialize(httpServer);

      // Initialize Workflow Engine (Listeners)
      // Just importing it is enough as it's a singleton instantiated on import
      Logger.info("[Server] Workflow Engine initialized");

      httpServer.listen(PORT, () => {
        console.log(
          `✅ ¡ÉXITO! CRM SaaS Backend corriendo en el puerto ${PORT}`
        );
      });
    } catch (err) {
      Logger.error(`[Server] Failed to start: ${err}`);
      process.exit(1);
    }
  };

  startServer();
}

// Exportamos tanto la app como el servidor http para flexibilidad
export { app, httpServer };
