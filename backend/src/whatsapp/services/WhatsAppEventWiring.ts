import { EventBus } from "../core/events/EventBus";
import { WhatsAppEventType, WhatsAppEvent } from "../core/events/WhatsAppEvents";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { IMessageHandler } from "../core/interfaces/IMessageHandler";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import { notificationRepository } from "@/repositories/NotificationRepository";
import { emailService } from "@/services/EmailService";
import { prisma } from "@/config/database";

export class WhatsAppEventWiring {
  constructor(
    private eventBus: EventBus,
    private sessionRepository: WhatsAppSessionRepository,
    private messageHandler: IMessageHandler,
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
          });

          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:connected", {
            sessionId: event.sessionId,
          });

          // [SEC] SCALE FIX: Start message queue worker on-demand for this company.
          // Workers are no longer pre-loaded for ALL companies at boot.
          const { ensureWorkerForCompany } = await import("@/loaders/workerLoader");
          await ensureWorkerForCompany(event.companyId);
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
            await this.sessionRepository
              .update(event.companyId, event.sessionId, {
                status: "DISCONNECTED",
              })
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
            return prisma.user.findMany({
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
                title: "🚨 WhatsApp Disconnected!",
                message: `The number associated with this account has been disconnected. Reason: ${errorReason}. Please rescan the QR code.`,
                type: "SYSTEM_ALERT",
              }
            }).then(() => {
                gateway.emitToUser(admin.id, "notification:new", { title: "WhatsApp Disconnected", type: "SYSTEM_ALERT" });
            }).catch(() => null);

            if (admin.email) {
              emailService.sendEmail({
                to: admin.email,
                subject: "🚨 Urgent: WhatsApp has disconnected in Reply CRM",
                html: `
                  <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #d9534f;">CRM System Alert</h2>
                    <p>Hello ${admin.name},</p>
                    <p>We have detected that the WhatsApp connection has been unexpectedly closed.</p>
                    <p><strong>Reported Reason:</strong> ${errorReason}</p>
                    <p>This means that <b>no new messages will come in or go out</b> until you take action. Please log in and re-link your device in the Settings section.</p>
                    <br/>
                    <p>Regards,<br/>The Reply CRM Team</p>
                  </div>
                `
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
