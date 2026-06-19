import { ISessionManager } from "../core/interfaces/ISessionManager";
import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType, WhatsAppEvent } from "../core/events/WhatsAppEvents";
import { SessionStatus } from "../core/types/whatsapp.types";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { Prisma } from "@prisma/client";

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
        // 1. Delete all sessions with no phone (never paired) on startup to prevent zombie cards
        // Grace period: only delete unlinked sessions if they are older than 1 hour to let active scans/connects survive reboots.
        const allSessions = await this.sessionRepository.findManySystem({});
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const unlinkedSessions = allSessions.filter(
          (s) => s.phone === null && s.createdAt < oneHourAgo
        );
        for (const session of unlinkedSessions) {
          Logger.info(`[WA] Deleting unlinked/empty session ${session.sessionId} on startup`);
          await this.sessionRepository.delete(session.companyId, session.sessionId).catch((err) => {
            Logger.error(`[WA] Failed to delete unlinked session ${session.sessionId}:`, err);
          });
        }

        // 2. Cleanup any residual active sessions that HAVE a phone on startup -> DISCONNECTED
        const residualActiveSessions = await this.sessionRepository.findByStatus(["CONNECTING", "SCANNING", "QR"]);
        const pairedZombies = residualActiveSessions.filter((s) => s.phone !== null);
        for (const session of pairedZombies) {
          Logger.info(`[WA] Cleaning up residual active session ${session.sessionId} on startup -> DISCONNECTED`);
          await this.sessionRepository.update(session.companyId, session.sessionId, {
            status: "DISCONNECTED",
            qrCode: null,
          }).catch((err) => {
            Logger.error(`[WA] Failed to clean up residual active session ${session.sessionId}:`, err);
          });
        }

        const sessions = await this.sessionRepository.findByStatus(["CONNECTED", "DISCONNECTED"]);

        if (sessions.length === 0) {
          Logger.info("[WA] No sessions to restore.");
          return;
        }

        // [SEC] RESTORE LIFECYCLE: Only restore sessions that have been paired/authenticated (non-null phone).
        // This avoids launching Baileys sockets for unlinked/empty sessions on boot, which would force them into SCANNING.
        const sessionsToRestore = sessions.filter((s) => s.phone !== null);

        if (sessionsToRestore.length === 0) {
          Logger.info("[WA] No active/paired sessions to restore.");
          return;
        }

        Logger.info(`[WA] Deferring restoration of ${sessionsToRestore.length} sessions to background.`);

        // Fire restoration in background (non-blocking) so server startup/boot healthchecks finish instantly
        setImmediate(() => {
          TenantContextManager.runAsSystem(async () => {
            Logger.info(`[WA] Starting background session restoration of ${sessionsToRestore.length} sessions...`);

            // Concurrency limit of N sessions at a time to prevent RAM/CPU spikes on boot
            const CONCURRENCY_LIMIT = 3;
            for (let i = 0; i < sessionsToRestore.length; i += CONCURRENCY_LIMIT) {
              const chunk = sessionsToRestore.slice(i, i + CONCURRENCY_LIMIT);

              await Promise.all(
                chunk.map(async (session) => {
                  try {
                    Logger.info(
                      `[WA] [BG-Restore] Restoring session ${session.sessionId} (Company: ${session.companyId})`,
                    );
                    await this.sessionManager.initializeSession({
                      sessionId: session.sessionId,
                      companyId: session.companyId,
                    });
                    Logger.info(`[WA] [BG-Restore] Restored: ${session.sessionId}`);
                  } catch (err) {
                    Logger.error(`[WA] [BG-Restore] ERROR: Failed to restore ${session.sessionId}:`, err);
                    
                    const isDecryptionError = err instanceof Error && err.message.includes("[AuthProvider] Decryption failed");
                    if (isDecryptionError) {
                      Logger.warn(
                        `[WA] [BG-Restore] Restoration skipped for ${session.sessionId} due to decryption failure (possible mismatched SESSION_SECRET). ` +
                        `Skipping status update in database to prevent breaking production.`
                      );
                    } else {
                      await this.sessionRepository
                        .update(session.companyId, session.sessionId, { status: "ERROR" })
                        .catch(() => {});
                    }
                  }
                })
              );

              // Add a small 1-second pause between chunks to let the CPU and connection pool settle
              if (i + CONCURRENCY_LIMIT < sessionsToRestore.length) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
            Logger.info("[WA] Background session restoration process complete.");
          }).catch((err) => {
            Logger.error("[WA] Background session restoration fatal error:", err);
          });
        });
      });

      Logger.info("[WA] Startup initialization complete (Restoration deferred to background).");
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
      if (existingSessions.length > 0) {
        // [SEC] RECYCLE LOGIC: Reuse existing session record to prevent duplicate integration lines.
        // If there's an active/connected session, return it directly to avoid spinning up another socket connection.
        const connectedSession = existingSessions.find((s) => s.status === "CONNECTED");
        if (connectedSession) {
          Logger.info(`[WA] Session already connected: ${connectedSession.sessionId} for company ${companyId}`);
          return {
            sessionId: connectedSession.sessionId,
            qrCode: null,
          };
        }

        // Recycle the first session we find for this company
        const sessionToRecycle = existingSessions[0];
        Logger.info(`[WA] Recycling existing session: ${sessionToRecycle.sessionId} (status: ${sessionToRecycle.status}) for company ${companyId}`);
        finalSessionId = sessionToRecycle.sessionId;
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
          phone: null,
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

  async updateSession(
    companyId: string,
    sessionId: string,
    data: { defaultQueueId?: string | null; proxyUrl?: string | null },
  ) {
    const session = await this.sessionRepository.findOne(companyId, sessionId);
    if (!session) {
      throw new AppError("Session not found or unauthorized", 404);
    }

    const updateData: Prisma.WhatsAppSessionUpdateInput = {};
    if (data.defaultQueueId !== undefined) {
      updateData.defaultQueue = data.defaultQueueId
        ? { connect: { id: data.defaultQueueId } }
        : { disconnect: true };
    }
    if (data.proxyUrl !== undefined) {
      updateData.proxyUrl = data.proxyUrl;
    }

    return this.sessionRepository.update(companyId, sessionId, updateData);
  }

  async getSession(companyId: string, sessionId: string): Promise<SessionStatus> {
    const record = await this.sessionRepository.findOne(companyId, sessionId);
    if (!record) {
      throw new AppError("No session found or unauthorized", 404);
    }
    const inMemoryStatus = this.sessionManager.getSessionStatus(sessionId);
    return {
      sessionId: record.sessionId,
      companyId: record.companyId,
      status:
        inMemoryStatus.status !== "DISCONNECTED"
          ? inMemoryStatus.status
          : (record.status as SessionStatus["status"]),
      phone: record.phone || undefined,
      qrCode: record.qrCode || undefined,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      defaultQueueId: record.defaultQueueId,
      proxyUrl: record.proxyUrl,
    };
  }

  async getSessions(companyId: string) {
    return this.sessionRepository.findByCompany(companyId);
  }

  async listSessions(companyId: string): Promise<SessionStatus[]> {
    const records = await this.sessionRepository.findByCompany(companyId);
    return records.map((record) => {
      const inMemoryStatus = this.sessionManager.getSessionStatus(
        record.sessionId,
      );
      return {
        sessionId: record.sessionId,
        companyId: record.companyId,
        status:
          inMemoryStatus.status !== "DISCONNECTED"
            ? inMemoryStatus.status
            : (record.status as SessionStatus["status"]),
        phone: record.phone || undefined,
        qrCode: record.qrCode || undefined,
        updatedAt: record.updatedAt,
        createdAt: record.createdAt,
        defaultQueueId: record.defaultQueueId,
        proxyUrl: record.proxyUrl,
      };
    });
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
