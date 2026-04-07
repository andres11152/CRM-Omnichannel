/**
 *  MESSAGE REACTION HANDLER
 *
 * Handles WhatsApp message reactions (emojis).
 * When a user/contact reacts to a message, this handler:
 * 1. Upserts the reaction in the DB
 * 2. Emits a real-time socket event
 *
 * Scoped by companyId to prevent data leaks.
 */

import { z } from "zod";
import { Logger } from "@/utils/logger";
import { TenantContextManager } from "@/config/tenantContext";
import { messageRepository } from "@/repositories/MessageRepository";
import { reactionRepository } from "@/repositories/ReactionRepository";
import { SocketEventEmitter } from "@/services/SocketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { SessionData } from "@/types/whatsapp.types";

// [SEC] Zod validation schema
const ReactionInputSchema = z.object({
  messageId: z.string().min(1),
  reaction: z.string(), // can be empty if removed
  participant: z.string().min(1),
});

export class MessageReactionHandler {
  private socketEmitter: SocketEventEmitter;

  constructor(private sessionCache: Map<string, SessionData>) {
    this.socketEmitter = new SocketEventEmitter(gateway);
  }

  async handleReaction(
    whatsappMessageId: string,
    reaction: string,
    participant: string,
    sessionId: string,
    eventCompanyId?: string,
  ): Promise<void> {
    // [SEC] Zod Validation
    const validated = ReactionInputSchema.safeParse({
      messageId: whatsappMessageId,
      reaction,
      participant,
    });

    if (!validated.success) {
      Logger.warn(`[ReactionHandler] [WARNING] Invalid reaction payload dropped`, {
        sessionId,
        errors: validated.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      return;
    }

    // [SEC] FIX: Use event companyId first, fallback to sessionCache
    const companyId = eventCompanyId || (this.sessionCache.get(sessionId)?.companyId as string);
    if (!companyId) {
      Logger.warn(`[ReactionHandler] [WARNING] No companyId for session ${sessionId} — reaction dropped`);
      return;
    }

    try {
      // 1. Find the target message
      const msg = await TenantContextManager.runAsSystem(() =>
        messageRepository.findMessageByWhatsAppId(whatsappMessageId, companyId),
      );

      if (!msg) {
        Logger.debug(
          `[ReactionHandler] Target message ${whatsappMessageId} not found in DB`,
        );
        return;
      }

      await TenantContextManager.run(
        {
          companyId: msg.companyId,
          userId: "system",
          requestId: `react:${whatsappMessageId}`,
        },
        async () => {
          if (!reaction) {
            // Remove reaction if text is empty
            await reactionRepository.removeReaction(
              msg.id,
              participant,
              companyId,
            );
            Logger.info(
              `[ReactionHandler] ️ Reaction removed from ${msg.id} by ${participant}`,
            );
          } else {
            // Upsert reaction
            await reactionRepository.upsertReaction({
              messageId: msg.id,
              reactBy: participant,
              content: reaction,
              companyId,
            });
            Logger.info(
              `[ReactionHandler] [OK] Reaction saved for ${msg.id}: ${reaction}`,
            );
          }

          // 2. Emit real-time event to frontend
          this.socketEmitter.emitMessageReaction(
            msg.id,
            msg.conversationId,
            companyId,
            reaction,
            participant,
          );
        },
      );
    } catch (error: unknown) {
      const isError = error instanceof Error;
      Logger.error(
        `[ReactionHandler] [ERROR] Failed to process reaction for ${whatsappMessageId}`,
        {
          sessionId,
          companyId,
          whatsappMessageId,
          participant,
          error: isError ? error.message : String(error),
          stack: isError ? error.stack : undefined,
        },
      );
    }
  }
}
