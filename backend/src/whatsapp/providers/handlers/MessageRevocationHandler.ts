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
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
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

    const companyId = await this.resolveCompanyId(sessionId);
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

  /**
   * [SEC] 100-YEAR FIX: `this.sessionCache` is a `Map` shared across
   * MessageHandler's sub-handlers (status/revocation/reaction) that was
   * NEVER populated anywhere in the codebase — only InboundMessageHandler
   * and PresenceHandler write to their OWN separate caches. As a result
   * every revocation ("delete for everyone") silently no-opped here,
   * forever, for every session. Fall back to a DB lookup (same pattern
   * InboundMessageHandler already uses) and warm the cache for next time.
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
