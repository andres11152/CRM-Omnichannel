import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { Logger } from "./utils/logger";
import { connectDB } from "./config/database";
import { connectRedis } from "./config/redis";
import { sessionManager } from "./whatsapp";
import OutboundWorker from "./workers/OutboundWorker";

import sessionRouter from "./routes/session.routes";
import messageRouter from "./routes/message.routes";
import commandRouter from "./routes/command.routes";
import { whatsAppSessionRepository } from "./repositories/WhatsAppSessionRepository";

const app = express();
app.use(express.json());

const rawPort = process.env.PORT || "10000";
const PORT = Number(rawPort);

if (!Number.isInteger(PORT) || PORT <= 0) {
  Logger.error(`[Server] Invalid PORT env var: ${JSON.stringify(rawPort)} — refusing to start.`);
  process.exit(1);
}

// 1. Healthcheck Route (handles both / and /health to support default platform probes)
app.get(["/", "/health"], (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// 2. Register Routers
app.use("/sessions", sessionRouter);
app.use("/messages", messageRouter);
app.use("/commands", commandRouter);

// 3. Bootstrap Service
const bootstrap = async () => {
  try {
    // A. Connect Infrastructure
    await connectDB();
    await connectRedis();

    // B. Start Workers
    Logger.info("[Server] Initializing Outbound Queue Workers...");
    new OutboundWorker();

    // C. Auto-heal Connected Sessions on Boot
    const activeSessions = await whatsAppSessionRepository.findActiveSessions();
    Logger.info(`[Server] Auto-healing ${activeSessions.length} active sessions on startup...`);
    
    for (const session of activeSessions) {
      sessionManager.initializeSession({
        sessionId: session.sessionId,
        companyId: session.companyId,
      }).catch((err: unknown) => {
        Logger.error(err, `[Server] Failed to auto-heal session ${session.sessionId}:`);
      });
    }

    // D. Start HTTP Server (binding to 0.0.0.0 explicitly for container orchestration compatibility)
    app.listen(PORT, "0.0.0.0", () => {
      Logger.info(`[Server] [OK] WhatsApp Microservice listening on port ${PORT}`);
    });
  } catch (err: unknown) {
    Logger.error(err, "[Server] Critical error during bootstrap:");
    process.exit(1);
  }
};

bootstrap();
