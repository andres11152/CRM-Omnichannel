import { Logger } from "@/utils/logger";
import {
  WAMessage,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { syncMessageParser } from "./SyncMessageParser";

/**
 *  MINIMAL BAILEYS STORE INTERFACE
 */
export interface BaileysStore {
  messages: Record<string, WAMessage[]>;
  lidToPhone?: Record<string, string>;
  getPhoneFromLid?: (lid: string) => string | undefined;
  chats: Map<string, { id: string; conversationTimestamp?: number | string | { toNumber?: () => number; low?: number } }>;
  contacts?: Record<string, import("@whiskeysockets/baileys").Contact>;
}

export interface HistoryContact {
  id: string;
  resolved?: boolean;
  lid?: string;
  name?: string;
}

/**
 * CHAT SYNC JID RESOLVER
 *
 * Responsible for:
 * - Resolving WhatsApp JIDs (phone-based and LID-based) to usable identifiers
 * - Accessing the Baileys in-memory store for a session
 * - Extracting and sorting messages from the store
 * - Pre-populating LID→Phone mappings from contacts and history
 */
export class ChatSyncJidResolver {

  resolveJid(jid: string, store: BaileysStore | null): string | null {
    if (jid.endsWith("@g.us")) return jid;

    // [SEC] LID RESOLUTION: WhatsApp internal IDs must be resolved to real phones
    if (jid.includes("@lid")) {
      // Strategy 1: getPhoneFromLid helper
      if (store?.getPhoneFromLid) {
        const resolved = store.getPhoneFromLid(jid);
        if (resolved) return resolved.split("@")[0];
      }

      // Strategy 2: Direct lidToPhone map lookup
      if (store?.lidToPhone) {
        const lidBase = jid.split("@")[0].split(":")[0];
        const mapped = store.lidToPhone[lidBase];
        if (mapped) return mapped.split("@")[0];
      }

      // [LOAD/DATA] UNRESOLVED LID → SKIP. Previously we fell back to the raw LID base,
      // which made the history sync create a junk Conversation for EVERY unresolvable LID
      // chat (hundreds of WhatsApp internal IDs / group participants). That flooded the
      // Prisma pool until Postgres closed connections (P1017) and the whole API 500'd.
      // A LID with no phone mapping is not an addressable contact, so dropping it loses
      // nothing useful and keeps the DB load bounded to REAL chats.
      return null;
    }

    // Normal @s.whatsapp.net JID → extract phone number
    return jid.split("@")[0].split(":")[0];
  }

  async resolveStore(companyId: string, contacts?: HistoryContact[]): Promise<BaileysStore | null> {
    const sessionGroups = await whatsappSessionRepository.findByStatus("CONNECTED", [companyId]);
    const session = sessionGroups[0] || null;
    const store = session ? await this.getSessionStore(session.sessionId) : null;

    if (store && store.lidToPhone) {
      if (contacts) {
        for (const c of contacts) {
          if (c.id && c.lid) {
            store.lidToPhone[c.lid.split("@")[0]] = c.id;
          }
        }
      }

      // Pre-populate using previously saved LID mappings from CRM contacts
      try {
        const { contactRepository } = await import("@/repositories/ContactRepository");
        const dbContacts = await contactRepository.findMany({
          where: {
            companyId,
            deletedAt: null,
          },
          select: { phone: true, customFields: true }
        });

        for (const c of dbContacts) {
          const fields = c.customFields as { whatsappLid?: string } | null;
          if (fields && typeof fields.whatsappLid === "string") {
            const lidBase = fields.whatsappLid.split("@")[0];
            store.lidToPhone[lidBase] = c.phone;
          }
        }
      } catch (err) {
        Logger.warn(`[ChatSync] Failed to pre-populate LID mappings from DB:`, err);
      }
    }
    return store;
  }

  async getSessionStore(sessionId: string): Promise<BaileysStore | null> {
    const { whatsappService } = await import("@/whatsapp");
    const store = whatsappService.getSessionStore(sessionId);
    return store as BaileysStore | null;
  }

  async resolveRealJid(
    companyId: string,
    sessionId: string,
    targetJid: string
  ): Promise<string> {
    if (!targetJid) return targetJid;
    if (targetJid.includes("@lid")) return targetJid;

    const cleanPhone = WhatsAppIdUtils.cleanChannelId(targetJid);

    // 1. Search database message metadata for this conversation
    const latestDbMsg = await messageRepository.findFirst({
      where: {
        companyId,
        conversation: {
          channelId: cleanPhone
        }
      },
      orderBy: { createdAt: "desc" }
    });

    if (latestDbMsg && latestDbMsg.metadata && typeof latestDbMsg.metadata === "object") {
      const meta = latestDbMsg.metadata as Record<string, unknown>;
      if (typeof meta.senderJid === "string" && meta.senderJid.includes("@lid")) {
        Logger.info(`[ChatSync] Resolved Real JID ${meta.senderJid} from DB metadata for channel ${cleanPhone}`);
        return meta.senderJid;
      }
    }

    // 2. Search in memory store
    const store = await this.getSessionStore(sessionId);
    if (store) {
      const cleanTarget = jidNormalizedUser(targetJid);
      const contact = store.contacts?.[cleanTarget];
      if (contact?.lid) {
        Logger.info(`[ChatSync] Resolved Real JID ${contact.lid} from memory contacts for channel ${cleanPhone}`);
        return contact.lid;
      }

      if (store.lidToPhone) {
        for (const [lidBase, phone] of Object.entries(store.lidToPhone)) {
          if (jidNormalizedUser(phone) === cleanTarget) {
            const resolved = `${lidBase}@lid`;
            Logger.info(`[ChatSync] Resolved Real JID ${resolved} from memory lidToPhone for channel ${cleanPhone}`);
            return resolved;
          }
        }
      }
    }

    // 3. Query WhatsApp servers in live mode (with safety timeout)
    const { whatsappService } = await import("@/whatsapp");
    const activeSession = await whatsappService.getSessionManager().findActiveSessionForCompany(companyId);
    if (activeSession) {
      try {
        const jidToCheck = targetJid.includes("@") ? targetJid : `${targetJid}@s.whatsapp.net`;
        const resolved = await Promise.race([
          activeSession.socket.onWhatsApp(jidToCheck),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("WhatsApp JID query timeout")), 4000)
          ),
        ]);
        if (resolved && resolved.length > 0 && resolved[0].exists) {
          const resolvedJid = resolved[0].jid;
          Logger.info(`[ChatSync] Resolved Real JID ${resolvedJid} from live WhatsApp query for channel ${cleanPhone}`);

          // Also save in store's lidToPhone map so we don't have to query again
          if (store && store.lidToPhone && resolvedJid.includes("@lid")) {
            const lidBase = resolvedJid.split("@")[0];
            store.lidToPhone[lidBase] = jidToCheck;
          }

          return resolvedJid;
        }
      } catch (err) {
        Logger.warn(`[ChatSync] Live JID resolution failed for ${cleanPhone}:`, err);
      }
    }

    return targetJid;
  }

  extractMessagesFromStore(store: BaileysStore, since?: Date | string, targetJid?: string): WAMessage[] {
    if (!store?.messages) return [];
    let all: WAMessage[] = [];

    const sinceTime = since ? (typeof since === "string" ? new Date(since).getTime() : since.getTime()) : 0;

    if (targetJid) {
      all = store.messages[targetJid] || [];
      if (all.length === 0) {
        const cleanTarget = jidNormalizedUser(targetJid);
        all = store.messages[cleanTarget] || [];

        if (all.length === 0 && store.lidToPhone) {
          // [SEC] Search for LID mapped to this phone JID
          for (const [lidBase, phone] of Object.entries(store.lidToPhone)) {
            if (jidNormalizedUser(phone) === cleanTarget) {
              all = store.messages[`${lidBase}@lid`] || [];
              if (all.length > 0) break;
            }
          }
        }
      }
    } else {
      Object.values(store.messages).forEach((msgs: WAMessage[]) => all.push(...msgs));
    }

    const sorted = all.sort((a, b) => syncMessageParser.getTimestamp(a.messageTimestamp) - syncMessageParser.getTimestamp(b.messageTimestamp));

    if (sinceTime > 0) {
      return sorted.filter((m) => syncMessageParser.getTimestamp(m.messageTimestamp) * 1000 > sinceTime);
    }

    return sorted;
  }

  groupMessagesByPhone(messages: WAMessage[], store: BaileysStore | null): Map<string, WAMessage[]> {
    const map = new Map<string, WAMessage[]>();
    for (const msg of messages) {
      const phone = this.resolveJid(msg.key.remoteJid!, store);
      if (!phone) continue;
      if (!map.has(phone)) map.set(phone, []);
      map.get(phone)!.push(msg);
    }
    return map;
  }
}

export const chatSyncJidResolver = new ChatSyncJidResolver();
