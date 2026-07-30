import { Logger } from "@/utils/logger";
import {
  WAMessage,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
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
  /** Baileys' processHistoryMessage() sets this when `id` itself is the @lid
   * JID — the chat's real phone counterpart (from the conversation's pnJid). */
  phoneNumber?: string;
  name?: string;
}

export interface LidPnMapping {
  lid: string;
  pn: string;
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

  resolveJid(jid: string, store: BaileysStore | null, lidPhoneMap?: Map<string, string>): string | null {
    if (jid.endsWith("@g.us")) return jid;

    // WhatsApp Channels (newsletters) are broadcast-only and should never appear as CRM
    // conversations. Their JIDs look like "120363...@newsletter".
    if (jid.includes("@newsletter")) return null;

    // [SEC] LID RESOLUTION: WhatsApp internal IDs must be resolved to real phones
    if (jid.includes("@lid")) {
      const lidBase = jid.split("@")[0].split(":")[0];

      // Tier 1: explicit batch map (buildLidPhoneMap) — Baileys' own lidPnMappings
      // + contacts + previously-persisted Contact.customFields.whatsappLid. This is
      // the ONLY tier with real data in this process: the Baileys in-memory store
      // (Strategy 2/3 below) lives exclusively in whatsapp-service post-split and
      // is never populated here — kept only for interface/test compatibility.
      if (lidPhoneMap?.has(lidBase)) return lidPhoneMap.get(lidBase)!;

      // Strategy 2: getPhoneFromLid helper
      if (store?.getPhoneFromLid) {
        const resolved = store.getPhoneFromLid(jid);
        if (resolved) return resolved.split("@")[0];
      }

      // Strategy 3: Direct lidToPhone map lookup
      if (store?.lidToPhone) {
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

  /**
   * Builds a LID→phone map for one history-sync batch. This is the sole source
   * of LID resolution in this process (see resolveJid's tier comment above) —
   * merges three signals, first-write-wins:
   *  1. Baileys' own {lid, pn} pairs, already resolved server-side and shipped
   *     on the `messaging-history.set` event (see SessionEventBinder.ts).
   *  2. The `contacts` array's own lid/phoneNumber fields (processHistoryMessage
   *     emits `id` as the chat's own JID — LID or PN — and the OTHER addressing
   *     scheme's counterpart on `lid`/`phoneNumber`; a chat entry with
   *     `id="...@lid"` carries the real phone on `phoneNumber`, not `lid`).
   *  3. Mappings already persisted on CRM contacts from earlier resolutions
   *     (live-message pipeline via IdentityResolverService, or a prior sync).
   */
  async buildLidPhoneMap(
    companyId: string,
    lidPnMappings?: LidPnMapping[],
    contacts?: HistoryContact[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const norm = (jid: string) => jid.split("@")[0].split(":")[0];

    for (const { lid, pn } of lidPnMappings || []) {
      if (lid && pn) map.set(norm(lid), norm(pn));
    }

    for (const c of contacts || []) {
      if (!c.id) continue;
      if (c.id.includes("@lid") && c.phoneNumber) {
        const lidBase = norm(c.id);
        if (!map.has(lidBase)) map.set(lidBase, norm(c.phoneNumber));
      } else if (c.lid && !c.id.includes("@lid")) {
        const lidBase = norm(c.lid);
        if (!map.has(lidBase)) map.set(lidBase, norm(c.id));
      }
    }

    try {
      const { contactRepository } = await import("@/repositories/ContactRepository");
      const dbContacts = await contactRepository.findMany({
        where: { companyId, deletedAt: null },
        select: { phone: true, customFields: true },
      });

      for (const c of dbContacts) {
        const fields = c.customFields as { whatsappLid?: string } | null;
        if (fields && typeof fields.whatsappLid === "string") {
          const lidBase = norm(fields.whatsappLid);
          if (!map.has(lidBase)) map.set(lidBase, c.phone);
        }
      }
    } catch (err) {
      Logger.warn(`[ChatSync] Failed to pre-populate LID mappings from DB:`, err);
    }

    return map;
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
      // `remoteJid` (set by ChatSyncBatchIngester for every history-synced message)
      // is the general-purpose field; `senderJid` is the older, narrower one that
      // only carries a usable value on INBOUND messages. Check both for rows
      // ingested before this field existed.
      if (typeof meta.remoteJid === "string" && meta.remoteJid.includes("@lid")) {
        Logger.info(`[ChatSync] Resolved Real JID ${meta.remoteJid} from DB metadata for channel ${cleanPhone}`);
        return meta.remoteJid;
      }
      if (typeof meta.senderJid === "string" && meta.senderJid.includes("@lid")) {
        Logger.info(`[ChatSync] Resolved Real JID ${meta.senderJid} from DB metadata for channel ${cleanPhone}`);
        return meta.senderJid;
      }
    }

    // 2. Ask whatsapp-service's live contact store. The Baileys socket (and
    // its in-memory contact/lid store) lives exclusively in that process now
    // — this backend's own store is never populated, so this has to go over
    // HTTP rather than reading a local Map.
    const { executeWhatsAppCommand } = await import("@/whatsapp/utils/whatsAppServiceHttp");
    try {
      const { lid } = await executeWhatsAppCommand<{ lid: string | null }>(
        companyId,
        "getContactInfo",
        [targetJid],
      );
      if (lid) {
        Logger.info(`[ChatSync] Resolved Real JID ${lid} from contact store for channel ${cleanPhone}`);
        return lid;
      }
    } catch (err) {
      Logger.warn(`[ChatSync] getContactInfo command failed for ${cleanPhone}:`, err);
    }

    // 3. Last resort: ask WhatsApp's own servers whether this number exists
    // and, if so, what JID (possibly a LID) it resolves to.
    try {
      const jidToCheck = targetJid.includes("@") ? targetJid : `${targetJid}@s.whatsapp.net`;
      const { exists, jid: resolvedJid } = await executeWhatsAppCommand<{ exists: boolean; jid: string | null }>(
        companyId,
        "onWhatsApp",
        [jidToCheck],
      );
      if (exists && resolvedJid) {
        Logger.info(`[ChatSync] Resolved Real JID ${resolvedJid} from live WhatsApp query for channel ${cleanPhone}`);
        return resolvedJid;
      }
    } catch (err) {
      Logger.warn(`[ChatSync] Live JID resolution failed for ${cleanPhone}:`, err);
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

  groupMessagesByPhone(
    messages: WAMessage[],
    store: BaileysStore | null,
    lidPhoneMap?: Map<string, string>,
  ): Map<string, WAMessage[]> {
    const map = new Map<string, WAMessage[]>();
    for (const msg of messages) {
      const phone = this.resolveJid(msg.key.remoteJid!, store, lidPhoneMap);
      if (!phone) continue;
      if (!map.has(phone)) map.set(phone, []);
      map.get(phone)!.push(msg);
    }
    return map;
  }
}

export const chatSyncJidResolver = new ChatSyncJidResolver();
