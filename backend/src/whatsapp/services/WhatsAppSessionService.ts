import { ISessionManager } from "../core/interfaces/ISessionManager";
import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType, WhatsAppEvent } from "../core/events/WhatsAppEvents";
import { SessionStatus } from "../core/types/whatsapp.types";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";

export class WhatsAppSessionService {
  constructor(
    private sessionManager: ISessionManager,
    private eventBus: EventBus,
    private sessionRepository: WhatsAppSessionRepository,
  ) {}

  async initialize(): Promise<void> {
    Logger.info("[WA] Initializing WhatsApp Session Service...");

    try {
      await TenantContextManager.runAsSystem(async () => {
        const sessions = await this.sessionRepository.findByStatus(["CONNECTED", "DISCONNECTED"]);

        if (sessions.length === 0) {
          Logger.info("[WA] No sessions to restore.");
          return;
        }

        Logger.info(`[WA] Restoring ${sessions.length} sessions...`);

        for (const session of sessions) {
          try {
            Logger.info(
              `[WA] Restoring session ${session.sessionId} (Company: ${session.companyId})`,
            );
            await this.sessionManager.initializeSession({
              sessionId: session.sessionId,
              companyId: session.companyId,
            });
            Logger.info(`[WA] Restored: ${session.sessionId}`);
          } catch (err) {
            Logger.error(`[WA] ERROR: Failed to restore ${session.sessionId}:`, err);
            await this.sessionRepository
              .update(session.companyId, session.sessionId, { status: "ERROR" })
              .catch(() => {});
          }
        }
      });

      Logger.info("[WA] Session restoration complete.");
    } catch (err) {
      Logger.error("[WA] ERROR: Initialization error:", err);
    }
  }

  async createSession(
    companyId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; qrCode: string | null }> {
    let finalSessionId = sessionId;

    if (!finalSessionId) {
      const existingSessions = await this.sessionRepository.findByCompany(companyId);
      const ghostSession = existingSessions.find((s) =>
        ["CONNECTING", "QR", "ERROR", "DISCONNECTED"].includes(s.status),
      );

      if (ghostSession) {
        Logger.info(`[WA] Recycling ghost session: ${ghostSession.sessionId} for company ${companyId}`);
        finalSessionId = ghostSession.sessionId;
      } else {
        finalSessionId = `wa_${companyId}_${Date.now().toString(36)}`;
      }
    }

    Logger.info(
      `[WA] Creating/Updating session ${finalSessionId} for company ${companyId}`,
    );

    try {
      const { planLimitsService } = await import("@/services/PlanLimitsService");

      const existing = await this.sessionRepository.findOne(companyId, finalSessionId);
      if (!existing) {
        const canCreate = await planLimitsService.canCreateResource(
          companyId,
          "whatsapp_sessions",
        );
        if (!canCreate) {
          throw new AppError(
            "You have reached the WhatsApp connection limit for your plan.",
            403,
          );
        }
      }
    } catch (planErr) {
      if (
        planErr &&
        typeof planErr === "object" &&
        "statusCode" in planErr &&
        (planErr as { statusCode: number }).statusCode === 403
      )
        throw planErr;
      Logger.warn(
        "[WA] Plan limits check skipped (service unavailable):",
        planErr,
      );
    }

    try {
      const session = await this.sessionRepository.findOne(companyId, finalSessionId);
      if (session) {
        await this.sessionRepository.update(companyId, finalSessionId, {
          status: "CONNECTING",
          qrCode: null,
        });
      } else {
        await this.sessionRepository.create({
          sessionId: finalSessionId,
          company: { connect: { id: companyId } },
          status: "CONNECTING",
        });
      }
    } catch (err) {
      Logger.error(`[WA] Error ensuring session record for ${finalSessionId}:`, err);
    }

    await this.sessionManager.initializeSession({
      sessionId: finalSessionId,
      companyId,
    });

    return new Promise((resolve) => {
      let resolved = false;

      const handler = (
        event: WhatsAppEvent<WhatsAppEventType.SESSION_QR_CODE>,
      ) => {
        if (event.sessionId === finalSessionId && event.data.qr && !resolved) {
          resolved = true;
          this.eventBus.off(WhatsAppEventType.SESSION_QR_CODE, handler);
          resolve({
            sessionId: finalSessionId,
            qrCode: event.data.qr,
          });
        }
      };

      this.eventBus.on(WhatsAppEventType.SESSION_QR_CODE, handler);

      setTimeout(async () => {
        if (!resolved) {
          const sessions = await this.sessionRepository.findByStatus(
            "CONNECTED",
            [companyId],
          );
          const isConnected = sessions.some(
            (s) => s.sessionId === finalSessionId,
          );

          if (isConnected && !resolved) {
            resolved = true;
            this.eventBus.off(WhatsAppEventType.SESSION_QR_CODE, handler);
            resolve({ sessionId: finalSessionId, qrCode: null });
          }
        }
      }, 3000);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.eventBus.off(WhatsAppEventType.SESSION_QR_CODE, handler);
          resolve({ sessionId: finalSessionId, qrCode: null });
        }
      }, 15000);
    });
  }

  async deleteSession(companyId: string, sessionId: string): Promise<void> {
    Logger.info(`[WA] Requested deletion for session ${sessionId} (Company: ${companyId})`);

    try {
      await Promise.race([
        this.sessionManager.terminateSession(sessionId, true),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Termination timeout")), 15000),
        ),
      ]).catch((err) => {
        Logger.warn(
          `[WA] Graceful termination for ${sessionId} timed out or failed, proceeding with local cleanup.`,
          err,
        );
      });
    } catch (err) {
      Logger.error(`[WA] Error during terminateSession for ${sessionId}:`, err);
    }

    try {
      await this.sessionRepository.delete(companyId, sessionId);
      Logger.info(`[WA] Session record ${sessionId} removed from DB.`);
    } catch (dbErr) {
      Logger.error(`[WA] ERROR: Failed to delete session record ${sessionId} from DB:`, dbErr);
      throw new AppError(
        "Could not delete session record. Please try again.",
        500,
      );
    }
  }

  async reconnectSession(companyId: string, sessionId: string): Promise<void> {
    const record = await this.sessionRepository.findOne(companyId, sessionId);
    if (!record) {
      throw new AppError("Session not found or unauthorized", 404);
    }
    await this.sessionManager.reconnectSession(sessionId);
  }

  async updateSessionQueue(
    companyId: string,
    sessionId: string,
    queueId: string | null,
  ) {
    const session = await this.sessionRepository.findOne(companyId, sessionId);
    if (!session) {
      throw new AppError("Session not found or unauthorized", 404);
    }

    return this.sessionRepository.update(companyId, sessionId, {
      defaultQueue: queueId
        ? { connect: { id: queueId } }
        : { disconnect: true },
    });
  }

  async getSession(companyId: string, sessionId: string): Promise<SessionStatus> {
    const record = await this.sessionRepository.findOne(companyId, sessionId);
    if (!record) {
      throw new AppError("No session found or unauthorized", 404);
    }
    return this.sessionManager.getSessionStatus(sessionId);
  }

  async getSessions(companyId: string) {
    return this.sessionRepository.findByCompany(companyId);
  }

  async listSessions(companyId: string): Promise<SessionStatus[]> {
    return this.sessionManager.listSessions(companyId);
  }

  async isCompanyConnected(companyId: string): Promise<boolean> {
    if (this.sessionManager.hasActiveSessionInMemory(companyId)) {
      return true;
    }

    const sessions = await this.sessionRepository.findByStatus("CONNECTED", [
      companyId,
    ]);
    return sessions.length > 0;
  }
}
