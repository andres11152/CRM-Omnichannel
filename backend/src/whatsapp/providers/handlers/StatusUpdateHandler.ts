import { WAMessageUpdate } from "@whiskeysockets/baileys";
import { z } from "zod";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { chatService } from "@/services/ChatService";
import { messageRepository } from "@/repositories/MessageRepository";
import { SessionData } from "@/types/whatsapp.types";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";

/**
 * [STAT] STATUS UPDATE HANDLER
 *
 * Handles WhatsApp message status updates (sent → delivered → read).
 * Maps numeric Baileys status codes to semantic status strings.
 */
export class StatusUpdateHandler {
  private socketEmitter: SocketEventEmitter;

  constructor(private sessionCache: Map<string, SessionData>) {
    this.socketEmitter = new SocketEventEmitter(gateway);
  }

  async handleMessageUpdate(
    whatsappMessageId: string,
    update: WAMessageUpdate,
    sessionId: string,
  ): Promise<void> {
    // [SEC] Zod Validation
    const inputSchema = z.object({
      whatsappMessageId: z.string().min(1),
      status: z.number().optional(),
    });

    const validated = inputSchema.safeParse({
      whatsappMessageId,
      status: update.update?.status,
    });

    if (!validated.success) {
      Logger.warn(`[StatusHandler] [WARNING] Invalid message update payload dropped`, {
        sessionId,
        errors: validated.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      return;
    }

    const currentStatus = update.update?.status;
    if (typeof currentStatus !== "number") return;

    try {
      const statusMap: Record<number, "sent" | "delivered" | "read"> = {
        2: "sent",
        3: "delivered",
        4: "read",
      };

      const newStatus = statusMap[currentStatus];
      if (!newStatus) return;

      const companyId = this.sessionCache.get(sessionId)?.companyId as string;
      if (!companyId) return;

      const msg = await TenantContextManager.runAsSystem(() =>
        messageRepository.findMessageByWhatsAppId(whatsappMessageId, companyId),
      );

      if (!msg) return;

      await TenantContextManager.run(
        { companyId: msg.companyId, userId: "system", requestId: "wa-update" },
        async () => {
          await chatService.updateMessageStatus(whatsappMessageId, newStatus);
        },
      );

      this.socketEmitter.emitMessageStatus(
        msg.id,
        msg.conversationId,
        msg.companyId || companyId,
        newStatus,
      );
    } catch (error) {
      Logger.error(
        `[StatusHandler] Failed to update message status for ${whatsappMessageId}:`,
        error,
      );
    }
  }
}
