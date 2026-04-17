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
          await this.sessionRepository.update(
            event.companyId,
            event.sessionId,
            {
              status: "CONNECTED",
            },
          );
          const { gateway } = await import("@/gateways/socketGateway");
          gateway.emitToCompany(event.companyId, "whatsapp:connected", {
            sessionId: event.sessionId,
          });
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
          const admins = await prisma.user.findMany({
            where: { companyId: event.companyId, role: "ADMIN" },
            select: { id: true, email: true, name: true }
          }).catch(() => []);

          const errorReason = String(event.data.reason || "Desconexión inesperada");

          // 2. Alert Internal Dashboard (In-App DB Notification)
          // 3. Fallback Email to Admin
          for (const admin of admins) {
            notificationRepository.create({
              data: {
                companyId: event.companyId,
                userId: admin.id,
                title: "🚨 ¡WhatsApp Desconectado!",
                message: `El número asociado a esta cuenta se ha desconectado. Motivo: ${errorReason}. Por favor, vuelve a escanear el código QR.`,
                type: "SYSTEM_ALERT",
              }
            }).then(() => {
                gateway.emitToUser(admin.id, "notification:new", { title: "WhatsApp Desconectado", type: "SYSTEM_ALERT" });
            }).catch(() => null);

            if (admin.email) {
              emailService.sendEmail({
                to: admin.email,
                subject: "🚨 Urgente: WhatsApp se ha desconectado en Reply CRM",
                html: `
                  <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #d9534f;">Alerta del Sistema CRM</h2>
                    <p>Hola ${admin.name},</p>
                    <p>Hemos detectado que la conexión con WhatsApp se ha cerrado de forma inesperada.</p>
                    <p><strong>Motivo Reportado:</strong> ${errorReason}</p>
                    <p>Esto significa que <b>entran ni salen mensajes nuevos</b> hasta que reacciones. Por favor, ingresa a la plataforma y vuelve a enlazar tu dispositivo en la sección de Configuración.</p>
                    <br/>
                    <p>Saludos,<br/>El Equipo de Reply CRM</p>
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

    this.eventBus.on(
      WhatsAppEventType.MESSAGE_RECEIVED,
      async (event: WhatsAppEvent<WhatsAppEventType.MESSAGE_RECEIVED>) => {
        const { companyId, sessionId } = event;
        try {
          await TenantContextManager.run(
            {
              companyId,
              userId: "system",
              requestId: `wa:msg:${event.data.message?.key?.id || "unknown"}`,
            },
            async () => {
              await this.messageHandler.handleIncoming(
                event.data.message,
                sessionId,
                companyId,
              );
            },
          );
        } catch (err) {
          Logger.error(`[WA] Error processing message for ${sessionId}:`, err);
        }
      },
    );
  }
}
