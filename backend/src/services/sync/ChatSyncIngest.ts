import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";
import { Channel, MessageDirection, Prisma } from "@prisma/client";
import {
  WAMessage,
  isJidBroadcast,
  WASocket,
} from "@whiskeysockets/baileys";
import { messageRepository } from "@/repositories/MessageRepository";
import { reactionRepository } from "@/repositories/ReactionRepository";
import { whatsappSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { TenantContextManager } from "@/config/tenantContext";
import { syncMediaService } from "./SyncMediaService";
import { syncMessageParser, ParsedMessage } from "./SyncMessageParser";
import { syncRepositoryHelper } from "./SyncRepositoryHelper";

export interface HistoryContact {
  id: string;
  resolved?: boolean;
  lid?: string;
  name?: string;
}

export interface HistoryChat {
  id: string;
  name?: string | null;
  subject?: string | null;
}

/**
 *  MINIMAL BAILEYS STORE INTERFACE
 */
export interface BaileysStore {
  messages: Record<string, WAMessage[]>;
  lidToPhone?: Record<string, string>;
  getPhoneFromLid?: (lid: string) => string | undefined;
  chats: Map<string, { id: string; conversationTimestamp?: number | string | { toNumber?: () => number; low?: number } }>;
}

/**
 * CHAT SYNC INGEST
 * Handles high-volume message ingestion from WhatsApp history and context sync.
 */
export class ChatSyncIngest {
  private activeContextSyncs = new Set<string>();

  // ------------------------------------------------
  // HISTORY SYNC (Bulk Ingest on Connection)
  // ------------------------------------------------

  async handleHistorySync(
    companyId: string,
    messages: WAMessage[],
    chats?: HistoryChat[],
    contacts?: HistoryContact[],
  ): Promise<void> {
    if ((!messages || messages.length === 0) && (!chats || chats.length === 0)) return;

    setImmediate(async () => {
      await TenantContextManager.run(
        { companyId, userId: "system", requestId: `history-sync-${companyId}` },
        async () => {
          try {
            Logger.info(`[ChatSync] History Ingest Started | ${messages?.length || 0} msgs, ${chats?.length || 0} chats`);

            const store = await this.resolveStore(companyId, contacts);
            const admin = await syncRepositoryHelper.getAdminUser(companyId);
            if (!admin) return;

            // 1. Identity Discovery
            if (chats) {
              for (const chat of chats) {
                const phone = this.resolveJid(chat.id, store);
                if (phone && !isJidBroadcast(chat.id)) {
                  await syncRepositoryHelper.ensureConversation({
                    companyId,
                    phone,
                    name: chat.name || chat.subject || undefined,
                    isGroup: chat.id.endsWith("@g.us")
                  });
                }
              }
            }

            if (!messages || messages.length === 0) return;

            // 2. Group Messages by Conversation
            const msgsByPhone = this.groupMessagesByPhone(messages, store);

            // 3. Process each conversation
            for (const [phone, chatMsgs] of msgsByPhone.entries()) {
              await this.ingestConversationBatch(companyId, phone, chatMsgs, admin.id);
            }

            Logger.info(`[ChatSync] History Ingest Complete for ${companyId}`);
          } catch (err: unknown) {
            Logger.error(`[ChatSync] ERROR: Fatal History Ingest Failure:`, {
              companyId,
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined
            });
          }
        }
      );
    });
  }

  // ------------------------------------------------
  // CONTEXT SYNC (On-Demand)
  // ------------------------------------------------

  async contextSync(companyId: string, conversationId: string, channelId: string): Promise<void> {
    const lockKey = `${companyId}:${conversationId}`;
    if (this.activeContextSyncs.has(lockKey)) return;

    this.activeContextSyncs.add(lockKey);
    gateway.emitToCompany(companyId, "conversation:sync_started", { conversationId, channelId, type: "chat_context" });
    
    let syncedCount = 0;

    try {
      const { whatsappService } = await import("@/whatsapp");
      const session = (await whatsappService.getSessions(companyId))?.find(s => s.status === "CONNECTED");
      if (!session) return;

      const store = await this.getSessionStore(session.sessionId);
      if (!store) return;

      const admin = await syncRepositoryHelper.getAdminUser(companyId);
      if (!admin) return;

      const targetJid = WhatsAppIdUtils.getTargetJid(channelId);
      let messages = this.extractMessagesFromStore(store, undefined, targetJid);

      // If memory store has no messages, fetch on-demand from WhatsApp
      if (messages.length === 0) {
        Logger.info(`[ContextSync] No messages in memory for ${channelId}, fetching on-demand from WhatsApp...`);
        const fetchSuccess = await this.fetchHistoryFromWhatsApp(companyId, session.sessionId, channelId, 50);
        if (fetchSuccess) {
          // Re-extract from store now that history sync event has updated it
          messages = this.extractMessagesFromStore(store, undefined, targetJid);
        }
      }

      const recent = messages.slice(-500);
      for (const msg of recent) {
        const result = await this.processMessage(companyId, channelId, msg, false, admin.id);
        if (result === "new") syncedCount++;
      }
    } catch (err: unknown) {
      Logger.error(`[ContextSync] ERROR: Failed for ${channelId}:`, {
        companyId,
        channelId,
        conversationId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
    } finally {
      this.activeContextSyncs.delete(lockKey);
      // ALWAYS emit finished event to unlock the UI, even if it returns early or fails!
      gateway.emitToCompany(companyId, "conversation:history_synced", { 
        conversationId, 
        channelId, 
        newMessages: syncedCount 
      });
    }
  }

  // ────────────────────────────────────────────────
  // CORE MESSAGE PROCESSOR
  // ────────────────────────────────────────────────

  async processMessage(
    companyId: string,
    channelId: string,
    msg: WAMessage,
    dryRun: boolean,
    fallbackSenderId: string
  ): Promise<"new" | "duplicate" | "skipped"> {
    if (!syncMessageParser.isValid(msg)) return "skipped";

    const whatsappMessageId = msg.key.id;
    if (!whatsappMessageId) return "skipped";

    const existing = await messageRepository.findFirst({ where: { whatsappMessageId, companyId } });

    if (existing) {
      await syncMediaService.healMedia(companyId, whatsappMessageId, msg, existing);
      return "duplicate";
    }

    if (dryRun) return "new";

    const isGroup = WhatsAppIdUtils.isGroup(channelId);
    // Strip @g.us from group JID to match Orchestrator's DB channelId format.
    const phone = isGroup 
      ? WhatsAppIdUtils.cleanChannelId(channelId) 
      : (WhatsAppIdUtils.getPhoneNumber(channelId) || channelId);

    const { conversation, customerUserId } = await syncRepositoryHelper.ensureConversation({
      companyId,
      phone,
      isGroup,
      name: (!msg.key.fromMe && msg.pushName) ? msg.pushName : undefined,
    });

    if (!conversation) return "skipped"; // Invalid phone (LID guard)

    const parsed: ParsedMessage | null = syncMessageParser.parseContent(msg);
    if (!parsed) return "skipped";

    if (parsed.type === "reaction") {
      const reactionContent = parsed.content as { key?: { id?: string }, text?: string | null } | undefined;
      if (reactionContent) {
        await this.handleReaction(companyId, reactionContent, customerUserId || fallbackSenderId);
      }
      return "skipped";
    }

    // Media Handling
    let mediaMeta: Record<string, unknown> = {};
    if (parsed.mediaType) {
      const { url, mimetype } = await syncMediaService.downloadAndUpload({
        companyId,
        whatsappMessageId,
        msg,
        mediaType: parsed.mediaType,
        msgContent: parsed.msgContent as Record<string, unknown>
      });

      mediaMeta = {
        mediaType: parsed.mediaType,
        mediaCaption: parsed.mediaCaption,
        mediaFilename: parsed.mediaFilename,
        media: {
          type: url ? parsed.mediaType : `${parsed.mediaType}_unavailable`,
          url: url || "",
          mimetype,
          name: parsed.mediaFilename || (parsed.mediaType === "audio" ? "Nota de voz" : "Adjunto"),
          size: 0
        }
      };
    }

    const metadata: Record<string, unknown> = {
      origin: "sync",
      ...mediaMeta,
      ...(parsed.contextInfo || {}),
      revoked: parsed.textContent.includes("eliminado")
    };

    await messageRepository.create({
      data: {
        companyId,
        conversationId: conversation.id,
        whatsappMessageId,
        content: parsed.textContent,
        channel: Channel.WHATSAPP,
        direction: parsed.direction === "OUTBOUND" ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
        senderId: parsed.direction === "OUTBOUND" ? fallbackSenderId : (customerUserId || fallbackSenderId),
        status: parsed.textContent.includes("eliminado") ? "REVOKED" : "DELIVERED",
        metadata: metadata as Prisma.InputJsonValue,
        createdAt: new Date(syncMessageParser.getTimestamp(msg.messageTimestamp) * 1000)
      }
    });

    return "new";
  }

  public async fetchHistoryFromWhatsApp(
    companyId: string,
    sessionId: string,
    channelId: string,
    limit: number = 100
  ): Promise<boolean> {
    try {
      const { whatsappService } = await import("@/whatsapp");
      const activeSession = await whatsappService.getSessionManager().findActiveSessionForCompany(companyId);
      if (!activeSession) {
        Logger.warn(`[ChatSync] No active session for company ${companyId}`);
        return false;
      }

      const sock = activeSession.socket;
      const targetJid = WhatsAppIdUtils.getTargetJid(channelId);

      // [SEC] Check if fetchMessageHistory method exists in this Baileys version
      if (typeof sock.fetchMessageHistory !== "function") {
        Logger.warn(`[ChatSync] fetchMessageHistory is NOT available in this Baileys version. Skipping on-demand fetch.`);
        return false;
      }

      // Find oldest message in database for this conversation to use as anchor
      const cleanPhone = WhatsAppIdUtils.cleanChannelId(targetJid);
      const oldestDbMsg = await messageRepository.findFirst({
        where: {
          companyId,
          conversation: {
            channelId: cleanPhone
          }
        },
        orderBy: { createdAt: "asc" }
      });

      if (!oldestDbMsg?.whatsappMessageId) {
        Logger.info(`[ChatSync] No existing messages in DB for ${cleanPhone}. Cannot anchor history fetch — relying on memory store or initial history sync.`);
        return false;
      }

      const oldestMsgKey: import("@whiskeysockets/baileys").WAMessageKey = {
        remoteJid: targetJid,
        fromMe: oldestDbMsg.direction === "OUTBOUND",
        id: oldestDbMsg.whatsappMessageId,
      };
      const oldestMsgTimestamp = Math.floor(new Date(oldestDbMsg.createdAt).getTime() / 1000);

      Logger.info(
        `[ChatSync] Requesting ${limit} historical messages on-demand from WhatsApp for ${targetJid}. Anchor msg: ${oldestMsgKey.id} at ${new Date(oldestMsgTimestamp * 1000).toISOString()}`
      );

      // Trigger the on-demand query to the phone
      await sock.fetchMessageHistory(limit, oldestMsgKey, oldestMsgTimestamp);
      
      // Wait for the messages to arrive and be processed via socket events
      // 5 seconds is a conservative estimate for the phone to respond
      await new Promise((resolve) => setTimeout(resolve, 5000));
      Logger.info(`[ChatSync] On-demand fetch completed (waited 5s) for ${targetJid}`);
      return true;
    } catch (err) {
      Logger.warn(`[ChatSync] fetchHistoryFromWhatsApp failed for ${channelId}:`, { error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  // ────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────

  private async ingestConversationBatch(companyId: string, phone: string, msgs: WAMessage[], adminId: string) {
    const isGroup = phone.includes("@g.us");
    const bestNameMsg = msgs.find(m => !m.key.fromMe && m.pushName);
    const { conversation, customerUserId } = await syncRepositoryHelper.ensureConversation({
      companyId,
      phone,
      isGroup,
      name: bestNameMsg?.pushName || undefined
    });

    if (!conversation) return; // Skipped invalid phone (LID guard)

    const validBatch: Prisma.MessageCreateManyInput[] = [];
    for (const msg of msgs) {
      const parsed: ParsedMessage | null = syncMessageParser.parseContent(msg);
      if (!parsed || parsed.type !== "message") continue;

      let mediaMeta: Record<string, unknown> = {};
      if (parsed.mediaType) {
        // [ENTERPRISE UX] Extreme Optimization: Skip synchronous media downloads during initial bulk history sync.
        // Downloading hundreds of expired or slow media files sequentially completely blocks the Node event loop,
        // causing timeouts and preventing real-time inbound messages from being processed.
        // Instead, we mark it as '_unavailable' and empty URL, allowing the agent to lazily recover it on-demand
        // via the retryMedia/retry download mechanism if they click on it in the UI.
        const mimetype = "application/octet-stream";
        mediaMeta = {
          mediaType: parsed.mediaType,
          mediaCaption: parsed.mediaCaption,
          mediaFilename: parsed.mediaFilename,
          media: {
            type: `${parsed.mediaType}_unavailable`,
            url: "",
            mimetype,
            name: parsed.mediaFilename || (parsed.mediaType === "audio" ? "Nota de voz" : "Adjunto"),
            size: 0
          }
        };
      }

      const metadata: Record<string, unknown> = { 
        origin: "history_sync", 
        ...mediaMeta,
        ...(parsed.contextInfo || {})
      };

      validBatch.push({
        companyId,
        conversationId: conversation.id,
        whatsappMessageId: msg.key.id!,
        content: parsed.textContent,
        channel: Channel.WHATSAPP,
        direction: parsed.direction === "OUTBOUND" ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
        senderId: parsed.direction === "OUTBOUND" ? adminId : (customerUserId || adminId),
        status: parsed.textContent.includes("eliminado") ? "REVOKED" : "DELIVERED",
        metadata: metadata as Prisma.InputJsonValue,
        createdAt: new Date(syncMessageParser.getTimestamp(msg.messageTimestamp) * 1000)
      });
    }

    if (validBatch.length > 0) {
      await messageRepository.createMany({ data: validBatch, skipDuplicates: true });
    }
  }

  private async handleReaction(companyId: string, react: { key?: { id?: string }, text?: string | null }, senderId: string) {
    const targetId = react.key?.id;
    if (!targetId) return;

    const targetMsg = await messageRepository.findFirst({ where: { whatsappMessageId: targetId, companyId } });
    if (!targetMsg) return;

    if (!react.text) {
      await reactionRepository.removeReaction(targetMsg.id, senderId, companyId);
    } else {
      await reactionRepository.upsertReaction({
        messageId: targetMsg.id,
        reactBy: senderId,
        content: react.text,
        companyId
      });
    }
  }

  private groupMessagesByPhone(messages: WAMessage[], store: BaileysStore | null) {
    const map = new Map<string, WAMessage[]>();
    for (const msg of messages) {
      const phone = this.resolveJid(msg.key.remoteJid!, store);
      if (!phone) continue;
      if (!map.has(phone)) map.set(phone, []);
      map.get(phone)!.push(msg);
    }
    return map;
  }

  private resolveJid(jid: string, store: BaileysStore | null): string | null {
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

      // ENTERPRISE FIX: Do NOT return the raw LID as a phone number!
      return null;
    }

    // Normal @s.whatsapp.net JID → extract phone number
    return jid.split("@")[0].split(":")[0];
  }

  private async resolveStore(companyId: string, contacts?: HistoryContact[]): Promise<BaileysStore | null> {
    const sessionGroups = await whatsappSessionRepository.findByStatus("CONNECTED", [companyId]);
    const session = sessionGroups[0];
    const store = session ? await this.getSessionStore(session.sessionId) : null;
    
    if (contacts && store && store.lidToPhone) {
      for (const c of contacts) {
        if (c.id && c.resolved && c.lid) {
          store.lidToPhone[c.lid.split("@")[0]] = c.id;
        }
      }
    }
    return store;
  }


  private async getSessionStore(sessionId: string): Promise<BaileysStore | null> {
    const { whatsappService } = await import("@/whatsapp");
    const store = whatsappService.getSessionStore(sessionId);
    return store as BaileysStore | null;
  }

  public extractMessagesFromStore(store: BaileysStore, since?: Date | string, targetJid?: string): WAMessage[] {
    if (!store?.messages) return [];
    let all: WAMessage[] = [];

    const sinceTime = since ? (typeof since === "string" ? new Date(since).getTime() : since.getTime()) : 0;

    if (targetJid) {
      all = store.messages[targetJid] || [];
      if (all.length === 0 && store.lidToPhone) {
        // [SEC] Search for LID mapped to this phone JID
        for (const [lidBase, phone] of Object.entries(store.lidToPhone)) {
          if (phone === targetJid) {
            all = store.messages[`${lidBase}@lid`] || [];
            if (all.length > 0) break;
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


}

export const chatSyncIngest = new ChatSyncIngest();
