import { WAMessageUpdate } from "@whiskeysockets/baileys";
import { z } from "zod";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { chatService } from "@/services/ChatService";
import { messageRepository } from "@/repositories/MessageRepository";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { SessionData } from "@/types/whatsapp.types";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { Prisma } from "@prisma/client";

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

    const companyId = await this.resolveCompanyId(sessionId);
    if (!companyId) return;

    // ─── PIN DETECTION ───────────────────────────────────────────────
    interface PinData {
      type?: number;
      sendingDevice?: number;
    }

    const rawUpdate = update as unknown as Record<string, unknown>;
    const updateObj = (rawUpdate.update as Record<string, unknown>) || {};
    
    const pinInChat = (
      rawUpdate.pinInChat || 
      updateObj.pinInChat || 
      rawUpdate.pinInChatMessage || 
      updateObj.pinInChatMessage
    ) as PinData | undefined;
    
    if (pinInChat) {
      await this.handlePinEvent(whatsappMessageId, companyId, pinInChat, update.key?.remoteJid);
      return; // Pin events don't carry status updates
    }

    // ─── STATUS UPDATE ───────────────────────────────────────────────
    const currentStatus = update.update?.status;
    if (typeof currentStatus !== "number") return;

    try {
      const statusMap: Record<number, "SENT" | "DELIVERED" | "READ"> = {
        2: "SENT",
        3: "DELIVERED",
        4: "READ",
      };

      const newStatus = statusMap[currentStatus];
      if (!newStatus) return;

      const msg = await TenantContextManager.runAsSystem(() =>
        messageRepository.findMessageByWhatsAppId(whatsappMessageId, companyId),
      );

      if (!msg) return;

      await TenantContextManager.run(
        { companyId: msg.companyId, userId: "system", requestId: "wa-update" },
        async () => {
          await chatService.updateMessageStatus(whatsappMessageId, msg.companyId, newStatus);
        },
      );

      this.socketEmitter.emitMessageStatus(
        msg.id,
        msg.conversationId,
        msg.companyId || companyId,
        newStatus.toLowerCase() as "sent" | "delivered" | "read",
      );
    } catch (error) {
      Logger.error(
        `[StatusHandler] Failed to update message status for ${whatsappMessageId}:`,
        error,
      );
    }
  }

  /**
   * Handle pin/unpin events from WhatsApp.
   * Baileys sends pinInChat.type: 1 = pin, 2 = unpin
   */
  private async handlePinEvent(
    whatsappMessageId: string,
    companyId: string,
    pinData?: { type?: number } | null,
    remoteJid?: string | null,
  ): Promise<void> {
    // type 1 = PIN, type 2 = UNPIN (Baileys convention)
    const isPinned = !pinData?.type || pinData.type === 1;

    try {
      const msg = await TenantContextManager.runAsSystem(() =>
        messageRepository.findMessageByWhatsAppId(whatsappMessageId, companyId),
      );

      // Resolve conversationId from JID if msg not found (crucial for unpinning old messages)
      let conversationId = msg?.conversationId;
      if (!conversationId && remoteJid) {
         const conv = await TenantContextManager.runAsSystem(() => 
           chatService.findOrCreateConversationByJid(companyId, remoteJid)
         );
         conversationId = conv.id;
      }

      if (msg) {
        // Update metadata with pin state
        const existingMeta = (msg.metadata as Prisma.JsonObject) || {};
        const updatedMeta: Prisma.JsonObject = {
          ...existingMeta,
          isPinned,
          pinnedAt: isPinned ? new Date().toISOString() : null,
        };

        await TenantContextManager.runAsSystem(() =>
          messageRepository.updateByWhatsAppId(whatsappMessageId, companyId, {
            metadata: updatedMeta,
          }),
        );
      }

      // ALWAYS emit if we have a conversationId (to clear the UI banner)
      if (conversationId) {
        this.socketEmitter.emitMessagePinned(
          msg?.id || whatsappMessageId,
          conversationId,
          companyId,
          isPinned,
          msg?.content || (isPinned ? "Mensaje de WhatsApp" : ""),
          msg?.senderId || "",
        );

        Logger.info(
          `[StatusHandler] [PIN] Message ${whatsappMessageId} ${isPinned ? "PINNED" : "UNPINNED"}. UI sync emitted.`,
        );
      }
    } catch (error) {
      Logger.error(`[StatusHandler] [PIN] Failed to handle pin event:`, error);
    }
  }

  /**
   * [SEC] 100-YEAR FIX: `this.sessionCache` is a `Map` shared across
   * MessageHandler's sub-handlers (status/revocation/reaction) that was
   * NEVER populated anywhere in the codebase — only InboundMessageHandler
   * and PresenceHandler write to their OWN separate caches. As a result
   * every status update (sent/delivered/read ticks) and pin/unpin event
   * silently no-opped here, forever. Fall back to a DB lookup (same
   * pattern InboundMessageHandler already uses) and warm the cache.
   */
  private async resolveCompanyId(sessionId: string): Promise<string | null> {
    const cached = this.sessionCache.get(sessionId)?.companyId;
    if (cached) return cached;

    const session = await whatsappSessionRepository.findSystemSession(sessionId);
    if (!session) return null;

    this.sessionCache.set(sessionId, {
      companyId: session.companyId,
      sessionId,
      status: "CONNECTED",
      userId: session.phone || undefined,
      defaultQueueId: session.defaultQueueId,
    });
    return session.companyId;
  }
}
