/**
 * ️ MESSAGE REVOCATION HANDLER
 *
 * Handles WhatsApp "Delete for Everyone" events.
 * When a user or contact deletes a message, this handler:
 * 1. Finds the original message in the database
 * 2. Updates its content to "[Mensaje eliminado]" and marks status as REVOKED
 * 3. Emits a real-time socket event so the frontend updates instantly
 *
 * Follows SRP: Only handles message deletion logic.
 */

import { z } from "zod";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { messageRepository } from "@/repositories/MessageRepository";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { SessionData } from "@/types/whatsapp.types";

// [SEC] Zod validation schema
const RevocationInputSchema = z.object({
  revokedMessageId: z.string().min(1),
  revokedBy: z.string().min(1),
  fromMe: z.boolean(),
});

export class MessageRevocationHandler {
  private socketEmitter: SocketEventEmitter;

  constructor(private sessionCache: Map<string, SessionData>) {
    this.socketEmitter = new SocketEventEmitter(gateway);
  }

  async handleRevocation(
    revokedMessageId: string,
    revokedBy: string,
    fromMe: boolean,
    sessionId: string,
  ): Promise<void> {
    // [SEC] Zod Validation
    const validated = RevocationInputSchema.safeParse({
      revokedMessageId,
      revokedBy,
      fromMe,
    });

    if (!validated.success) {
      Logger.warn(`[RevocationHandler] [WARNING] Invalid revocation payload dropped`, {
        sessionId,
        errors: validated.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      return;
    }

    const companyId = this.sessionCache.get(sessionId)?.companyId as string;
    if (!companyId) {
      Logger.warn(
        `[RevocationHandler] [WARNING] No companyId found for session ${sessionId}`,
      );
      return;
    }

    try {
      // 1. Find the original message
      const msg = await TenantContextManager.runAsSystem(() =>
        messageRepository.findMessageByWhatsAppId(revokedMessageId, companyId),
      );

      if (!msg) {
        Logger.debug(
          `[RevocationHandler] Message ${revokedMessageId} not found in DB (may be too old or already deleted)`,
        );
        return;
      }

      // 2. Update the message in DB
      await TenantContextManager.run(
        {
          companyId: msg.companyId,
          userId: "system",
          requestId: `revoke:${revokedMessageId}`,
        },
        async () => {
          await messageRepository.updateMany({
            where: { whatsappMessageId: revokedMessageId, companyId },
            data: {
              content: " Este mensaje fue eliminado",
              status: "REVOKED",
              metadata: {
                revoked: true,
                revokedAt: new Date().toISOString(),
                revokedBy: fromMe ? "sender" : "contact",
              },
            },
          });
        },
      );

      Logger.info(
        `[RevocationHandler] [OK] Message ${revokedMessageId} marked as REVOKED (by: ${fromMe ? "sender" : "contact"})`,
      );

      // 3. Emit real-time event to frontend
      this.socketEmitter.emitMessageRevoked(
        msg.id,
        msg.conversationId,
        companyId,
      );
    } catch (error) {
      Logger.error(
        `[RevocationHandler] [ERROR] Failed to process revocation for ${revokedMessageId}:`,
        error,
      );
    }
  }
}
