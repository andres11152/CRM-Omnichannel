import { ISessionManager } from "../../core/interfaces/ISessionManager";
import { Logger } from "@/utils/logger";
import { PresenceUpdateSchema } from "../../core/validation/baileys.schemas";
import { TenantContextManager } from "@/config/tenantContext";
import { chatService } from "@/services/chatService";
import { IdentityResolverService } from "../../services/IdentityResolverService";
import { WhatsAppIdUtils } from "../../utils/WhatsAppIdUtils";
import { SessionData } from "@/types/whatsapp.types";
import { SocketEventEmitter } from "@/services/socketEventEmitter";
import { gateway } from "@/gateways/socketGateway";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import {
  WhatsAppEventType,
  WhatsAppEventData,
} from "../../core/events/WhatsAppEvents";

/**
 * 📡 PRESENCE HANDLER
 *
 * Handles typing indicators (composing/recording/paused)
 * from WhatsApp contacts and emits them via Socket.IO.
 */
export class PresenceHandler {
  private socketEmitter: SocketEventEmitter;
  private sessionCache = new Map<string, SessionData>();

  constructor(
    private sessionManager: ISessionManager,
    private identityResolver: IdentityResolverService,
  ) {
    this.socketEmitter = new SocketEventEmitter(gateway);
  }

  async handlePresenceUpdate(
    data: WhatsAppEventData[WhatsAppEventType.PRESENCE_UPDATE],
    sessionId: string,
  ): Promise<void> {
    // 🛡️ Zod Validation
    const validated = PresenceUpdateSchema.safeParse(data);
    if (!validated.success) {
      Logger.warn(
        `[PresenceHandler] ⚠️ Invalid presence update payload dropped`,
        {
          sessionId,
          errors: validated.error.errors.map(
            (e) => `${e.path.join(".")}: ${e.message}`,
          ),
        },
      );
      return;
    }

    const { id: remoteJid, presences } = data;
    if (!remoteJid || !presences) return;

    const participant = Object.keys(presences)[0];
    if (!participant) return;

    const presence = presences[participant];
    const status = (presence.lastKnownPresence || "paused") as
      | "composing"
      | "recording"
      | "paused";

    Logger.info(`[Presence] 📥 Event from ${remoteJid}: ${status}`);

    const sessionData = await this.ensureSessionData(sessionId);
    if (!sessionData) {
      Logger.warn(`[Presence] ⚠️ SessionData missing for ${sessionId}`);
      return;
    }

    await TenantContextManager.run(
      {
        companyId: sessionData.companyId,
        userId: "system",
        requestId: `presence:${remoteJid}`,
      },
      async () => {
        const originalJid = WhatsAppIdUtils.getCleanJid(remoteJid);
        const targetJid = await this.identityResolver.resolvePresenceJid(
          originalJid,
          sessionId,
        );

        const chatUniqueId = targetJid.split("@")[0];

        let conv = await chatService.findConversation(
          sessionData.companyId,
          chatUniqueId,
          `${chatUniqueId}@whatsapp.user`,
        );

        if (!conv && targetJid !== originalJid) {
          Logger.warn(
            `[Presence] ⚠️ Phone lookup failed for ${targetJid}, trying LID fallback...`,
          );
          const fallbackId = originalJid.split("@")[0];
          conv = await chatService.findConversation(
            sessionData.companyId,
            fallbackId,
            `${fallbackId}@whatsapp.user`,
          );
        }

        if (conv) {
          Logger.info(`[Presence] 📡 Emitting ${status} to Chat ${conv.id}`);
          this.socketEmitter.emitConversationTyping(
            conv.id,
            sessionData.companyId,
            targetJid,
            status,
          );
        } else {
          Logger.warn(
            `[Presence] ❌ Conversation NOT FOUND. Original: ${originalJid}, Target: ${targetJid}, Company: ${sessionData.companyId}`,
          );
        }
      },
    );
  }

  // ────────────────────────────────────────────────
  // SESSION DATA CACHE
  // ────────────────────────────────────────────────

  private async ensureSessionData(
    sessionId: string,
  ): Promise<SessionData | null> {
    let sessionData = this.sessionCache.get(sessionId);
    if (!sessionData) {
      const session =
        await whatsappSessionRepository.findSystemSession(sessionId);
      if (!session) return null;
      sessionData = {
        companyId: session.companyId,
        sessionId,
        status: "CONNECTED",
        userId: session.phone || undefined,
        defaultQueueId: session.defaultQueueId,
      };
      this.sessionCache.set(sessionId, sessionData);
    }
    return sessionData;
  }
}
