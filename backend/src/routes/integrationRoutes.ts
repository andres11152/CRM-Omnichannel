import express from "express";
// ♻️ REFACTOR: Unified Service
import { whatsappService } from "@/whatsapp";
import { AuthenticatedRequest } from "@/types/types";
import { protect } from "@/middleware/authMiddleware";
import * as integrationController from "@/controllers/integrationController";
import { Logger } from "@/utils/logger";

const router = express.Router();

// All routes here should be protected
router.use(protect);

// List Integrations
router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const companyId = authReq.companyId || authReq.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID missing" });
    }

    const sessions = await whatsappService.listSessions(companyId);

    // For now, we only support one session per company in the UI logic,
    // but the backend supports multiple. We'll map them.
    const integrations = sessions.map((session) => ({
      id: session.sessionId,
      companyId: session.companyId,
      type: "whatsapp_cloud", // Using this type for compatibility with frontend filter
      name: `WhatsApp (${session.phone || "Linked Device"})`,
      status: session.status === "CONNECTED" ? "connected" : "disconnected",
      config: {
        phone: session.phone || "Linked Device",
      },
      connectedAt:
        session.status === "CONNECTED" ? session.updatedAt : undefined,
    }));

    res.status(200).json(integrations);
  } catch (error) {
    Logger.error("List integrations error:", error as Error);
    res.status(500).json({ message: "Failed to list integrations" });
  }
});

// WhatsApp Session Management - Get Status of FIRST session or specific one
router.get(
  "/whatsapp/session",
  async (req: express.Request, res: express.Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const companyId = authReq.companyId || authReq.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ message: "Company ID missing" });
      }

      // Get the most recent session
      const sessions = await whatsappService.listSessions(companyId);
      const session = sessions[0]; // Just take the first one for now

      if (!session) {
        return res.status(200).json({ status: "disconnected" });
      }

      res.status(200).json(session);
    } catch {
      res.status(500).json({ message: "Failed to get session status" });
    }
  },
);

router.get(
  "/whatsapp/status",
  async (req: express.Request, res: express.Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const companyId = authReq.companyId || authReq.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ message: "Company ID missing" });
      }

      const sessions = await whatsappService.listSessions(companyId);
      const session = sessions[0];

      if (!session) {
        return res.status(200).json({ status: "disconnected" });
      }

      res.status(200).json(session);
    } catch {
      res.status(500).json({ message: "Failed to get session status" });
    }
  },
);

router.post(
  "/whatsapp/session",
  async (req: express.Request, res: express.Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const companyId = authReq.companyId || authReq.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ message: "Company ID missing" });
      }

      // Check if session exists
      const sessions = await whatsappService.listSessions(companyId);
      const existingSession = sessions[0];
      let sessionId: string;

      if (!existingSession) {
        const result = await whatsappService.createSession(companyId);
        sessionId = result.sessionId; // ✅ Fixed to match new API
      } else if (existingSession.status === "DISCONNECTED") {
        // Re-initialize if disconnected using reconnectSession
        await whatsappService.reconnectSession(existingSession.sessionId);
        sessionId = existingSession.sessionId;
      } else {
        sessionId = existingSession.sessionId;
      }

      // Poll for QR code for up to 30 seconds
      let attempts = 0;
      const maxAttempts = 60; // 60 * 500ms = 30 seconds

      const checkQr = async () => {
        // Fix: use getSession instead of getSessionStatus
        const currentSession = await whatsappService.getSession(sessionId);
        if (currentSession?.qrCode) {
          res.status(200).json({
            message: "Session initialization started",
            qr: currentSession.qrCode,
            sessionId: sessionId,
          });
          return true;
        }
        if (currentSession?.status === "CONNECTED") {
          res
            .status(200)
            .json({ message: "Already connected", status: "connected" });
          return true;
        }
        return false;
      };

      const poll = setInterval(async () => {
        attempts++;
        const found = await checkQr();
        if (found) {
          clearInterval(poll);
        } else if (attempts >= maxAttempts) {
          clearInterval(poll);
          res.status(200).json({
            message:
              "Session initialization started, please check status endpoint for QR",
          });
        }
      }, 500);
    } catch (error) {
      Logger.error("Init session error:", error as Error);
      res.status(500).json({ message: "Failed to init session" });
    }
  },
);

router.delete(
  "/whatsapp/session",
  async (req: express.Request, res: express.Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const companyId = authReq.companyId || authReq.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ message: "Company ID missing" });
      }

      const sessions = await whatsappService.listSessions(companyId);
      for (const session of sessions) {
        await whatsappService.deleteSession(session.sessionId);
      }

      res.status(200).json({ message: "Logged out successfully" });
    } catch {
      res.status(500).json({ message: "Failed to logout" });
    }
  },
);

router.post("/whatsapp/sync", integrationController.syncMessages);

export default router;
