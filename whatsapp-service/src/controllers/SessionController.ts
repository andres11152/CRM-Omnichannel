import { Request, Response } from "express";
import { Logger } from "../utils/logger";
import { sessionManager } from "../whatsapp";
import { whatsAppSessionRepository } from "../repositories/WhatsAppSessionRepository";
import { InitSessionSchema } from "../schemas/session.schema";

export class SessionController {
  static async initSession(req: Request, res: Response): Promise<void> {
    const parseResult = InitSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.format() });
      return;
    }

    const { companyId, sessionId, phone, proxyUrl } = parseResult.data;
    const finalSessionId = sessionId || `wa_${companyId}_${Date.now()}`;

    try {
      Logger.info(`[SessionController] Request to initialize session ${finalSessionId} for company ${companyId}`);

      await whatsAppSessionRepository.ensureSessionRecord(finalSessionId, companyId);

      if (proxyUrl !== undefined) {
        await whatsAppSessionRepository.upsertProxy(finalSessionId, companyId, proxyUrl || null);
      }

      sessionManager.initializeSession({
        sessionId: finalSessionId,
        companyId,
        phoneForPairing: phone,
      }).catch((err: unknown) => {
        Logger.error(err, `[SessionController] Background session init failed for ${finalSessionId}:`);
      });

      res.json({ sessionId: finalSessionId, status: "CONNECTING" });
    } catch (err: unknown) {
      Logger.error(err, `[SessionController] Failed to initialize session ${finalSessionId}:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async terminateSession(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params as { sessionId: string };
    const clearAuth = req.query.clearAuth === "true" || req.body.clearAuth === true;

    try {
      Logger.info(`[SessionController] Terminating session ${sessionId} (clearAuth: ${clearAuth})`);
      await sessionManager.terminateSession(sessionId, clearAuth);
      res.json({ success: true });
    } catch (err: unknown) {
      Logger.error(err, `[SessionController] Failed to terminate session ${sessionId}:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async reconnectSession(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params as { sessionId: string };

    try {
      Logger.info(`[SessionController] Force reconnecting session ${sessionId}`);
      await sessionManager.reconnectSession(sessionId);
      res.json({ success: true });
    } catch (err: unknown) {
      Logger.error(err, `[SessionController] Failed to reconnect session ${sessionId}:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async getStatus(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params as { sessionId: string };
    try {
      const status = sessionManager.getSessionStatus(sessionId);
      res.json(status);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async listSessions(req: Request, res: Response): Promise<void> {
    const { companyId } = req.params as { companyId: string };
    try {
      const list = sessionManager.listSessions(companyId);
      res.json(list);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}
