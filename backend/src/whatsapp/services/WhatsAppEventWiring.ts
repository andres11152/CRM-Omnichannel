import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType, WhatsAppEvent } from "../core/events/WhatsAppEvents";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import { notificationRepository } from "@/repositories/NotificationRepository";
import { emailService } from "@/services/EmailService";
import { whatsappDisconnectedEmail } from "@/utils/emailTemplates";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import { userRepository } from "@/repositories/UserRepository";
import { Prisma } from "@prisma/client";

export class WhatsAppEventWiring {
  constructor(
    private eventBus: EventBus,
    private sessionRepository: WhatsAppSessionRepository,
    private messageHandler: IMessageHandler,
    private sessionManager: ISessionManager,
  ) {}

  setupEventHandlers(): void {
    this.eventBus.on(
      WhatsAppEventType.SESSION_CONNECTED,
      async (event: WhatsAppEvent<WhatsAppEventType.SESSION_CONNECTED>) => {
        Logger.info(`[WA] Session connected: ${event.sessionId}`);
        try {
          // [SEC] CRITICAL: Baileys socket callbacks run OUTSIDE any HTTP/tenant context.
          // Without runAsSystem, the sessionRepository.update call hits the RLS interceptor
          // and throws "SECURITY VIOLATION", which silently prevents ensureWorkerForCompany
          // from ever executing — causing ALL agent outbound messages to get stuck in queue.
          await TenantContextManager.runAsSystem(async () => {
            await this.sessionRepository.update(
              event.companyId,
              event.sessionId,
              {
                status: "CONNECTED",
              },
            );

            // Clean up any other zombie/unlinked sessions for this company
            const allSessions = await this.sessionRepository.findByCompany(event.companyId);
            const zombies = allSessions.filter(
              (s) =>
                s.sessionId !== event.sessionId &&
                (s.phone === null || ["SCANNING", "CONNECTING"].includes(s.status))
            );

            for (const zombie of zombies) {
              Logger.info(
                `[WA] Terminating and deleting zombie session ${zombie.sessionId} (status: ${zombie.status}) for company ${event.companyId} after successful connection of ${event.sessionId}`,
              );

              // 1. Terminate in-memory session (close socket & clear credentials)
              try {
                await Promise.race([
                  this.sessionManager.terminateSession(zombie.sessionId, true),
                  new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Termination timeout")), 10000),
                  ),
                ]);
              } catch (termErr) {
                Logger.warn(
                  `[WA] Failed to terminate zombie socket for ${zombie.sessionId}, proceeding with DB delete:`,
                  termErr,
                );
              }

              // 2. Delete database record
              try {
                await this.sessionRepository.delete(event.companyId, zombie.sessionId);
                Logger.info(`[WA] Zombie session ${zombie.sessionId} removed from DB.`);
              } catch (dbErr) {
                Logger.error(
                  `[WA] Failed to delete zombie session ${zombie.sessionId} from DB:`,
                  dbErr,
                );
              }

              // 3. Emit socket event to notify frontend to remove this session card
              try {
                const { gateway } = await import("@/gateways/socketGateway");
                gateway.emitToCompany(event.companyId, "session.status", {
                  sessionId: zombie.sessionId,
                  status: "DELETED",
                  timestamp: new Date(),
                });
              } catch (emitErr) {
                Logger.error(`[WA] Failed to emit DELETED event for zombie session ${zombie.sessionId}:`, emitErr);
              }
            }
          });

          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:connected", {
            sessionId: event.sessionId,
          });

          // [SEC] SCALE FIX: Start message queue worker on-demand for this company.
          // Workers are no longer pre-loaded for ALL companies at boot.
          const { ensureWorkerForCompany } = await import("@/loaders/workerLoader");
          await ensureWorkerForCompany(event.companyId);

          // [FIX] AUTO-RETRY: Retry failed Bull jobs on reconnect.
          // Messages that failed while the session was down sit in the per-company
          // whatsapp-messages:${companyId} Bull queue. Retry them now that we're back.
          try {
            const { messageQueueService } = await import("@/services/queue/messageQueueService");
            const queue = messageQueueService.getQueue(event.companyId);
            const failedJobs = await queue.getFailed(0, 100);

            if (failedJobs.length > 0) {
              let retried = 0;
              let discarded = 0;
              for (const job of failedJobs) {
                const maxAttempts = (job.opts?.attempts as number | undefined) ?? 10;
                if (job.attemptsMade >= maxAttempts) {
                  // Permanently failed — remove from queue so it never replays on startup.
                  await job.remove().catch(() => {});
                  discarded++;
                } else {
                  await job.retry().catch((retryErr: Error) => {
                    Logger.warn(`[WA] Failed to retry job ${job.id}: ${retryErr.message}`);
                  });
                  retried++;
                }
              }
              Logger.info(`[WA] Outbound job recovery for company ${event.companyId}: ${retried} retried, ${discarded} permanently-failed discarded`);
            }
          } catch (retryErr) {
            Logger.warn("[WA] Non-critical: Failed to retry outbound jobs on reconnect:", retryErr);
          }
        } catch (err) {
          Logger.error("[WA] Error handling session_connected:", err);
        }
      },
    );

    this.eventBus.on(
      WhatsAppEventType.SESSION_DISCONNECTED,
      async (event: WhatsAppEvent<WhatsAppEventType.SESSION_DISCONNECTED>) => {
        Logger.warn(`[WA] Session disconnected: ${event.sessionId}`);
        try {
          // [SEC] Same RLS fix as SESSION_CONNECTED — Baileys callbacks have no tenant context.
          await TenantContextManager.runAsSystem(async () => {
            const dataToUpdate: Prisma.WhatsAppSessionUpdateInput = {
              status: "DISCONNECTED",
            };
            if (event.data && event.data.isReconnecting === false) {
              dataToUpdate.phone = null;
              dataToUpdate.qrCode = null;
            }

            await this.sessionRepository
              .update(event.companyId, event.sessionId, dataToUpdate)
              .catch((dbErr: { code?: string }) => {
                if (dbErr?.code === "P2025") {
                  Logger.warn(
                    `[WA] Session ${event.sessionId} already removed from DB, skipping update.`,
                  );
                  return;
                }
                throw dbErr;
              });
          });

          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:disconnected", {
            sessionId: event.sessionId,
            reason: event.data.reason,
          });

          // [SEC] ENTERPRISE FALLBACK (Omnichannel Alerts)
          // 1. Alert External APIs (Webhooks)
          webhookDispatcher.dispatch(event.companyId, "whatsapp.disconnected", {
            sessionId: event.sessionId,
            reason: event.data.reason,
            timestamp: new Date().toISOString()
          }).catch(() => null);

          // Find Company Admins to alert via internal UI and Email
          const admins = await TenantContextManager.runAsSystem(async () => {
            return userRepository.findMany({
              where: { companyId: event.companyId, role: "ADMIN" },
              select: { id: true, email: true, name: true }
            }).catch(() => []);
          });

          const errorReason = String(event.data.reason || "Unexpected disconnection");

          // 2. Alert Internal Dashboard (In-App DB Notification)
          // 3. Fallback Email to Admin
          for (const admin of admins) {
            notificationRepository.create({
              data: {
                companyId: event.companyId,
                userId: admin.id,
                title: "[CRITICAL] WhatsApp Disconnected!",
                message: `The number associated with this account has been disconnected. Reason: ${errorReason}. Please rescan the QR code.`,
                type: "SYSTEM_ALERT",
              }
            }).then(() => {
                gateway.emitToUser(admin.id, "notification:new", { title: "WhatsApp Disconnected", type: "SYSTEM_ALERT" });
            }).catch(() => null);

            if (admin.email) {
              const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
              const { html, text } = whatsappDisconnectedEmail({
                adminName: admin.name,
                reason: errorReason,
                reconnectUrl: `${frontendUrl}/settings`,
              });
              emailService.sendEmail({
                to: admin.email,
                subject: "WhatsApp se desconectó · Sentry CRM",
                html,
                text,
              }).catch(() => null);
            }
          }

        } catch (err) {
          Logger.error("[WA] Error handling session_disconnected:", err);
        }
      },
    );

    this.eventBus.on(
      WhatsAppEventType.SESSION_QR_CODE,
      async (event: WhatsAppEvent<WhatsAppEventType.SESSION_QR_CODE>) => {
        try {
          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:qr", {
            sessionId: event.sessionId,
            qrCode: event.data.qr,
          });
        } catch (err) {
          Logger.error("[WA] Error emitting QR:", err);
        }
      },
    );

    // [FIX] DISABLED: This handler is REDUNDANT.
    // MessageHandler.subscribeToEvents() already subscribes to MESSAGE_RECEIVED
    // via eventBus.subscribe() and enqueues to BullMQ.
    // Having TWO subscribers caused every message to be processed TWICE.
    // this.eventBus.on(
    //   WhatsAppEventType.MESSAGE_RECEIVED,
    //   async (event: WhatsAppEvent<WhatsAppEventType.MESSAGE_RECEIVED>) => {
    //     ...
    //   },
    // );
  }
}
