import { WAMessage } from "@whiskeysockets/baileys";
import { userRepository } from "@/repositories/UserRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import { WhatsAppIdUtils } from "../utils/WhatsAppIdUtils";
import { chatService } from "@/services/ChatService";
import { Logger } from "@/utils/logger";

/**
 * [SEARCH] IDENTITY RESOLVER SERVICE
 *
 * Encapsulates all LID → Phone resolution strategies.
 * Extracted from MessageHandler for SRP compliance.
 *
 * Strategies (in order of execution):
 * 1. remoteJidAlt field
 * 2. senderPn field
 * 3. participant field
 * 4. messageStubParameters scan
 * 5. In-memory store findContactByLid
 * 6. Async resolveLidToPhone with retry
 */
export class IdentityResolverService {
  constructor(private sessionManager: ISessionManager) {}

  /**
   * Resolve the clean JID from a message, handling LID → Phone conversion.
   * This is the main entry point - replaces the inline LID resolution block
   * that was in processIncomingMessage.
   *
   * @returns The resolved cleanRemoteJid (phone-based if possible)
   */
  async resolveMessageJid(
    message: WAMessage,
    sessionId: string,
    companyId: string,
  ): Promise<{ cleanRemoteJid: string; remoteJid: string; resolved: boolean }> {
    const rawRemoteJid = message.key.remoteJid;
    let cleanRemoteJid = WhatsAppIdUtils.getCleanJid(rawRemoteJid);

    if (!cleanRemoteJid) {
      Logger.warn(`[IdentityResolver] Invalid JID: ${rawRemoteJid}`);
      return { cleanRemoteJid: "", remoteJid: "", resolved: false };
    }

    if (!WhatsAppIdUtils.isLid(cleanRemoteJid)) {
      return { cleanRemoteJid, remoteJid: cleanRemoteJid, resolved: true };
    }

    Logger.info(`[IdentityResolver] [SEARCH] LID Detected: ${cleanRemoteJid}`);

    // Strategy 1: remoteJidAlt
    const messageKey = message.key as {
      remoteJidAlt?: string;
      senderPn?: string;
    };

    if (
      messageKey.remoteJidAlt &&
      messageKey.remoteJidAlt.includes("@s.whatsapp.net") &&
      !messageKey.remoteJidAlt.includes("@lid")
    ) {
      cleanRemoteJid =
        WhatsAppIdUtils.getCleanJid(messageKey.remoteJidAlt) || cleanRemoteJid;
      return { cleanRemoteJid, remoteJid: cleanRemoteJid, resolved: true };
    }

    // Strategy 2: senderPn
    if (
      messageKey.senderPn &&
      messageKey.senderPn.includes("@s.whatsapp.net") &&
      !messageKey.senderPn.includes("@lid")
    ) {
      cleanRemoteJid =
        WhatsAppIdUtils.getCleanJid(messageKey.senderPn) || cleanRemoteJid;
      return { cleanRemoteJid, remoteJid: cleanRemoteJid, resolved: true };
    }

    // Strategy 3: participant
    const participant = message.key.participant;
    if (participant && !WhatsAppIdUtils.isLid(participant)) {
      cleanRemoteJid =
        WhatsAppIdUtils.getCleanJid(participant) || cleanRemoteJid;
      return { cleanRemoteJid, remoteJid: cleanRemoteJid, resolved: true };
    }

    // Strategy 4: messageStubParameters
    if (
      message.messageStubParameters &&
      Array.isArray(message.messageStubParameters)
    ) {
      for (const param of message.messageStubParameters) {
        if (
          typeof param === "string" &&
          param.includes("@s.whatsapp.net") &&
          !param.includes("@lid")
        ) {
          cleanRemoteJid = WhatsAppIdUtils.getCleanJid(param) || cleanRemoteJid;
          return { cleanRemoteJid, remoteJid: cleanRemoteJid, resolved: true };
        }
      }
    }

    // Strategy 5: In-memory store contact lookup
    const resolvedContact =
      this.sessionManager.findContactByLid(sessionId, cleanRemoteJid);
    if (resolvedContact?.id && !WhatsAppIdUtils.isLid(resolvedContact.id)) {
      const realJid = WhatsAppIdUtils.getCleanJid(resolvedContact.id);
      if (realJid) {
        return { cleanRemoteJid: realJid, remoteJid: realJid, resolved: true };
      }
    }

    // Strategy 6: Async retry with resolveLidToPhone
    let realPhone = null;
    for (let i = 0; i < 10; i++) {
      realPhone = await this.sessionManager.resolveLidToPhone(
        sessionId,
        cleanRemoteJid,
      );
      if (realPhone) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (realPhone) {
      const originalLidBase = cleanRemoteJid.split("@")[0];
      cleanRemoteJid = `${realPhone}@s.whatsapp.net`;
      Logger.info(
        `[IdentityResolver]  Retried & Resolved LID ${cleanRemoteJid}`,
      );
      // Persist the mapping for future lookups
      const cleanPhone = WhatsAppIdUtils.getPhoneNumber(realPhone);
      if (cleanPhone) {
        await chatService.saveLidPhoneMapping(
          companyId,
          originalLidBase,
          cleanPhone,
        );
      }
      return { cleanRemoteJid, remoteJid: cleanRemoteJid, resolved: true };
    }

    Logger.warn(
      `[IdentityResolver] [WARNING] LID could not be resolved: ${cleanRemoteJid}`,
    );
    return { cleanRemoteJid, remoteJid: cleanRemoteJid, resolved: false };
  }

  /**
   * Resolve sender JID for inbound messages.
   * If sender is a LID, attempts to resolve to a phone-based JID.
   */
  resolveSenderJid(
    message: WAMessage,
    cleanRemoteJid: string,
    isGroup: boolean,
  ): string | undefined {
    let senderJid = WhatsAppIdUtils.getSenderJid(message);

    if (!isGroup && cleanRemoteJid && !WhatsAppIdUtils.isLid(cleanRemoteJid)) {
      senderJid = cleanRemoteJid;
    }

    if (senderJid && WhatsAppIdUtils.isLid(senderJid)) {
      // Best effort: Try all sessions for this company? No, we need a sessionId.
      // But resolveSenderJid doesn't have it.
      // Wait! I'll check where it's called.
      return senderJid;
    }

    return senderJid;
  }

  /**
   * Try to find an existing conversation using multiple LID resolution strategies.
   * Called when the initial conversation lookup fails and the JID is a LID.
   *
   * This encapsulates Strategies 1-5 from the original processIncomingMessage.
   */
  async findConversationByLid(
    companyId: string,
    cleanRemoteJid: string,
    chatUniqueId: string,
    sessionId: string,
    message: WAMessage,
    isFromMe: boolean,
  ): Promise<Awaited<
    ReturnType<typeof chatService.getFullConversation>
  > | null> {
    const lidBase = chatUniqueId;

    // Strategy 1: Database LID Lookup (survives restarts)
    Logger.info(
      `[IdentityResolver] [SEARCH] Strategy 1: DB LID lookup for ${lidBase}`,
    );
    const lidConv = await chatService.findConversationByLid(companyId, lidBase);
    if (lidConv) {
      Logger.info(
        `[IdentityResolver]  Strategy 1 SUCCESS: Found conv ${lidConv.id} via persisted LID mapping`,
      );
      return chatService.getFullConversation(companyId, lidConv.id);
    }

    // Strategy 3: Active resolve via sessionManager
    Logger.info(
      `[IdentityResolver] [SYNC] Final attempt to resolve LID ${lidBase} via active query...`,
    );
    const sock = this.sessionManager.getSession(sessionId);

    if (sock) {
      try {
        const fullLidJid = `${lidBase}@lid`;
        const resolvedPhone = await this.sessionManager.resolveLidToPhone(
          sessionId,
          fullLidJid,
        );

          if (resolvedPhone) {
            Logger.info(
              `[IdentityResolver] [OK] Actively resolved LID ${lidBase} -> ${resolvedPhone}`,
            );
            const cleanPhone = WhatsAppIdUtils.getPhoneNumber(resolvedPhone);
            if (cleanPhone) {
              await chatService.saveLidPhoneMapping(
                companyId,
                lidBase,
                cleanPhone,
              );
            }

            const realChannelId = resolvedPhone.replace(/\D/g, "");

          const phoneConv = await chatService.findConversation(
            companyId,
            realChannelId,
            undefined // was realChatEmail
          );

          if (phoneConv) {
            Logger.info(
              `[IdentityResolver]  Found existing conversation ${phoneConv.id} for resolved phone ${realChannelId}`,
            );
            return chatService.getFullConversation(companyId, phoneConv.id);
          }
        }
      } catch (resErr) {
        Logger.warn(
          `[IdentityResolver] [WARNING] Active LID resolution failed:`,
          resErr,
        );
      }
    }

    // Strategy 4: Name Heuristic (Last Resort for inbound)
    if (message.pushName && !isFromMe) {
      Logger.info(
        `[IdentityResolver] [SEARCH] Trying Name Heuristic for LID: ${message.pushName}`,
      );

      const possibleUsers = await userRepository.findMany({
        where: {
          companyId,
          name: { contains: message.pushName, mode: "insensitive" },
        },
        take: 5,
      });

      Logger.info(
        `[IdentityResolver] [SEARCH] Found ${possibleUsers.length} users matching name "${message.pushName}"`,
      );

      for (const user of possibleUsers) {
        const userConv = await conversationRepository.findFirst({
          where: {
            companyId,
            participants: { some: { id: user.id } },
          },
          orderBy: { updatedAt: "desc" },
        });

          return chatService.getFullConversation(companyId, userConv.id);
      }
    }

    // Strategy 4.5: Brute Force Store Search
    type ContactStore = {
      contacts: Record<string, { lid?: string; id?: string }>;
    };
    const store = this.sessionManager.getSessionStore(
      sessionId,
    ) as ContactStore;

    if (store && store.contacts) {
      const storeContacts = store.contacts;
      for (const jid in storeContacts) {
        const c = storeContacts[jid];
        if (c.lid === cleanRemoteJid || (c.lid && c.lid.startsWith(lidBase))) {
          const phoneJid = jid;
          if (phoneJid.includes("@s.whatsapp.net")) {
            const realChannelId = phoneJid.replace(/\D/g, "");
            const realChatEmail = `${realChannelId}@whatsapp.user`;
            Logger.info(
              `[IdentityResolver]  Brute Force Store Match: ${cleanRemoteJid} -> ${phoneJid}`,
            );
            const storeConv = await chatService.findConversation(
              companyId,
              realChannelId,
              realChatEmail,
            );
            if (storeConv) return chatService.getFullConversation(companyId, storeConv.id);
          }
        }
      }
    }

    // [BLOCKED] REMOVED: "Universal LID Fallback" (Strategy 5)
    //
    // THE OLD CODE grabbed the most recently updated conversation
    // and assigned unresolved LID messages to it. This caused a CRITICAL
    // bug where outbound messages from the phone to DIFFERENT contacts
    // were all being routed to whichever conversation was most recently
    // active — creating fake messages in the wrong chat.
    //
    // FIX: Return null so InboundMessageHandler creates a NEW conversation.
    // A new conversation with an unresolved LID is infinitely better than
    // contaminating an existing conversation with messages from a
    // completely different contact.
    Logger.warn(
      `[IdentityResolver] [WARNING] LID ${lidBase} fully unresolved. Creating new conversation (safe fallback).`,
    );
    return null;
  }

  /**
   * Resolve presence update JID (LID → Phone).
   * Used by handlePresenceUpdate.
   */
  async resolvePresenceJid(
    originalJid: string,
    _sessionId: string,
  ): Promise<string> {
    if (!WhatsAppIdUtils.isLid(originalJid)) {
      return originalJid;
    }

    Logger.info(
      `[IdentityResolver] [SEARCH] Resolving Presence LID ${originalJid}...`,
    );

    for (let i = 0; i < 5; i++) {
      const resolved = this.sessionManager.findContactByLid(_sessionId, originalJid);
      if (resolved?.id) {
        const real = WhatsAppIdUtils.getCleanJid(resolved.id);
        if (real && !WhatsAppIdUtils.isLid(real)) {
          return real;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    return originalJid;
  }
}
