/**
 * ✏️ MESSAGE EDIT HANDLER
 *
 * Handles WhatsApp message edit events (type 14 protocolMessage).
 * When a user or contact edits a message, this handler:
 * 1. Finds the original message in the database
 * 2. Parses the new content using SyncMessageParser
 * 3. Updates the database record with the new content and edit metadata
 * 4. Emits a real-time socket update so the frontend updates in-place
 *
 * Follows SRP and CRM clean architecture.
 */

import { proto, WAMessage } from "@whiskeysockets/baileys";
import { z } from "zod";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { messageRepository } from "@/repositories/MessageRepository";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { SessionData } from "@/types/whatsapp.types";
import { syncMessageParser } from "@/services/sync/SyncMessageParser";
import { ConversationQueryService } from "@/services/ConversationQueryService";

const EditInputSchema = z.object({
  originalMessageId: z.string().min(1),
  editedMessage: z.record(z.unknown()),
});

export class MessageEditHandler {
  private socketEmitter: SocketEventEmitter;
  private conversationQueryService: ConversationQueryService;

  constructor(private sessionCache: Map<string, SessionData>) {
    this.socketEmitter = new SocketEventEmitter(gateway);
    this.conversationQueryService = new ConversationQueryService();
  }

  async handleEdit(
    originalMessageId: string,
    editedMessage: proto.IMessage,
    sessionId: string,
  ): Promise<void> {
    const validated = EditInputSchema.safeParse({
      originalMessageId,
      editedMessage,
    });

    if (!validated.success) {
      Logger.warn(`[MessageEditHandler] [WARNING] Invalid edit payload dropped`, {
        sessionId,
        errors: validated.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      return;
    }

    const companyId = await this.resolveCompanyId(sessionId);
    if (!companyId) {
      Logger.warn(`[MessageEditHandler] [WARNING] No companyId found for session ${sessionId}`);
      return;
    }

    try {
      // 1. Find original message
      const msg = await TenantContextManager.runAsSystem(() =>
        messageRepository.findMessageByWhatsAppId(originalMessageId, companyId)
      );

      if (!msg) {
        Logger.debug(`[MessageEditHandler] Original message ${originalMessageId} not found in DB`);
        return;
      }

      // 2. Parse new content
      const fakeMsg: WAMessage = {
        key: { id: originalMessageId, fromMe: msg.direction === "OUTBOUND" },
        message: editedMessage,
        messageTimestamp: Math.floor(Date.now() / 1000),
      };

      const parsed = syncMessageParser.parseContent(fakeMsg);
      if (!parsed) {
        Logger.debug(`[MessageEditHandler] Parsed edit was null/empty for message ${originalMessageId}`);
        return;
      }

      const updatedContent = parsed.textContent || "";
      const existingMeta = (msg.metadata as Record<string, unknown>) || {};

      // 3. Update database record
      const updatedMsg = await TenantContextManager.run(
        {
          companyId,
          userId: "system",
          requestId: `edit:${originalMessageId}`,
        },
        async () => {
          await messageRepository.update(
            msg.id,
            {
              content: updatedContent,
              metadata: {
                ...existingMeta,
                isEdited: true,
                editedAt: new Date().toISOString(),
              },
            },
            companyId
          );

          return await messageRepository.findFirst({
            where: { id: msg.id, companyId },
            include: {
              sender: true,
            },
          });
        }
      );

      if (!updatedMsg) {
        Logger.warn(`[MessageEditHandler] Failed to retrieve updated message record for ${originalMessageId}`);
        return;
      }

      Logger.info(`[MessageEditHandler] [OK] Updated message ${originalMessageId} content in DB`);

      // 4. Resolve full conversation details for socket payload
      const conv = await TenantContextManager.run(
        { companyId, userId: "system", requestId: `edit-emit:${originalMessageId}` },
        async () => {
          return await this.conversationQueryService.getConversation(companyId, msg.conversationId);
        }
      );

      if (conv) {
        // Find ticketId for active workspace tracking
        const ticketId = conv.contact?.id || "";

        // 5. Emit real-time updates via Socket.IO
        if (msg.direction === "OUTBOUND") {
          this.socketEmitter.emitMessageSent(updatedMsg, conv, ticketId);
        } else {
          this.socketEmitter.emitMessageReceived(updatedMsg, conv, ticketId);
        }
      }
    } catch (error) {
      Logger.error(`[MessageEditHandler] [ERROR] Failed to process message edit for ${originalMessageId}:`, error);
    }
  }

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
