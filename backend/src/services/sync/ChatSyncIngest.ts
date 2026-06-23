import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";
import { Channel, MessageDirection, Prisma } from "@prisma/client";
import {
  WAMessage,
  isJidBroadcast,
  WASocket,
  jidNormalizedUser,
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
  contacts?: Record<string, import("@whiskeysockets/baileys").Contact>;
}

/**
 * CHAT SYNC INGEST
 * Handles high-volume message ingestion from WhatsApp history and context sync.
 */
export class ChatSyncIngest {
  private activeContextSyncs = new Set<string>();

  // [POOL-SAFETY] Serial executor for history syncs. Baileys can fire many
  // `messaging-history.set` events in a burst (reconnect / full re-link), and each
  // sync runs hundreds of sequential DB round-trips. Running them concurrently
  // drained the Prisma pool (connection_limit=15) → every API request (incl. /health)
  // queued 20s and 408'd. Chaining them so AT MOST ONE runs at a time leaves the
  // pool free for live API traffic. Background sync slowing down is an acceptable
  // trade vs. taking the whole app down.
  private historySyncChain: Promise<void> = Promise.resolve();
  private pendingHistorySyncs = 0;

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

    // Enqueue onto the serial chain (fire-and-forget — keep the socket handler non-blocking).
    this.pendingHistorySyncs++;
    this.historySyncChain = this.historySyncChain
      .catch(() => {}) // never let one failure break the chain
      .then(() => this.runHistorySync(companyId, messages, chats, contacts))
      .finally(() => {
        this.pendingHistorySyncs--;
      });
  }

  private async runHistorySync(
    companyId: string,
    messages: WAMessage[],
    chats?: HistoryChat[],
    contacts?: HistoryContact[],
  ): Promise<void> {
    await TenantContextManager.run(
      { companyId, userId: "system", requestId: `history-sync-${companyId}` },
      async () => {
        try {
          Logger.info(
            `[ChatSync] History Ingest Started | ${messages?.length || 0} msgs, ${chats?.length || 0} chats (queued: ${this.pendingHistorySyncs - 1})`,
          );

          const store = await this.resolveStore(companyId, contacts);
          const admin = await syncRepositoryHelper.getAdminUser(companyId);
          if (!admin) return;

          // 1. Identity Discovery
          if (chats) {
            for (const chat of chats) {
              const phone = this.resolveJid(chat.id, store);
              if (phone && !isJidBroadcast(chat.id)) {
                const isGroup = chat.id.endsWith("@g.us");
                const cleanPhone = isGroup ? WhatsAppIdUtils.cleanChannelId(phone) : phone;
                await syncRepositoryHelper.ensureConversation({
                  companyId,
                  phone: cleanPhone,
                  name: chat.name || chat.subject || undefined,
                  isGroup
                });
              }
            }
          }

          if (!messages || messages.length === 0) return;

          // 2. Group Messages by Conversation
          const msgsByPhone = this.groupMessagesByPhone(messages, store);

          // 3. Process each conversation. Yield to the event loop between conversations
          // so the API stays responsive even during a large sync.
          for (const [phone, chatMsgs] of msgsByPhone.entries()) {
            await this.ingestConversationBatch(companyId, phone, chatMsgs, admin.id);
            await new Promise((r) => setImmediate(r));
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

      let targetJid = WhatsAppIdUtils.getTargetJid(channelId);
      targetJid = await this.resolveRealJid(companyId, session.sessionId, targetJid);
      let messages = this.extractMessagesFromStore(store, undefined, targetJid);

      // If memory store has fewer than 15 messages, fetch on-demand from WhatsApp to backfill history
      if (messages.length < 15) {
        Logger.info(`[ContextSync] Only ${messages.length} messages in memory for ${channelId}, fetching on-demand from WhatsApp...`);
        const fetchSuccess = await this.fetchHistoryFromWhatsApp(companyId, session.sessionId, channelId, 50);
        if (fetchSuccess) {
          // Re-extract from store now that history sync event has updated it
          messages = this.extractMessagesFromStore(store, undefined, targetJid);
        }

        // [ENTERPRISE] If memory store STILL has few messages, the on-demand fetch may have
        // gone through the messaging-history.set → DB pipeline instead of populating the store.
        // In that case, messages are already in the DB and will appear on the next query refresh.
        // Emit the sync_completed event to force the frontend to refetch conversation data.
        if (messages.length < 5) {
          Logger.info(`[ContextSync] Memory store still sparse (${messages.length} msgs). Triggering frontend refresh.`);
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

    const isGroup = WhatsAppIdUtils.isGroup(msg.key.remoteJid || channelId);
    // Strip @g.us from group JID to match Orchestrator's DB channelId format.
    const phone = isGroup 
      ? WhatsAppIdUtils.cleanChannelId(msg.key.remoteJid || channelId) 
      : (WhatsAppIdUtils.getPhoneNumber(msg.key.remoteJid || channelId) || channelId);

    const { conversation, customerUserId } = await syncRepositoryHelper.ensureConversation({
      companyId,
      phone,
      isGroup,
      name: isGroup ? undefined : ((!msg.key.fromMe && msg.pushName) ? msg.pushName : undefined),
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
      senderJid: WhatsAppIdUtils.getSenderJid(msg) || undefined,
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
      let targetJid = WhatsAppIdUtils.getTargetJid(channelId);
      targetJid = await this.resolveRealJid(companyId, sessionId, targetJid);

      // Find oldest message in database for this conversation to use as anchor
      const cleanPhone = WhatsAppIdUtils.cleanChannelId(channelId);
      const oldestDbMsg = await messageRepository.findFirst({
        where: {
          companyId,
          conversation: {
            channelId: cleanPhone
          }
        },
        orderBy: { createdAt: "asc" }
      });

      // Snapshot the current store message count BEFORE requesting history
      const store = await this.getSessionStore(sessionId);
      const preCount = store ? this.extractMessagesFromStore(store, undefined, targetJid).length : 0;

      let oldestMsgKey: import("@whiskeysockets/baileys").WAMessageKey;
      let oldestMsgTimestampMs: number;
      let anchorSource: string;

      if (oldestDbMsg?.whatsappMessageId) {
        oldestMsgKey = {
          remoteJid: targetJid,
          fromMe: oldestDbMsg.direction === "OUTBOUND",
          id: oldestDbMsg.whatsappMessageId,
        };
        oldestMsgTimestampMs = new Date(oldestDbMsg.createdAt).getTime();
        anchorSource = "Database";
      } else if (store) {
        // Tier 2: Search Baileys Memory Store for anchor message
        const memMessages = this.extractMessagesFromStore(store, undefined, targetJid);
        if (memMessages && memMessages.length > 0) {
          const oldestMemMsg = memMessages[0]; // Already sorted by timestamp asc
          if (oldestMemMsg.key && oldestMemMsg.key.id) {
            oldestMsgKey = {
              remoteJid: targetJid,
              fromMe: oldestMemMsg.key.fromMe || false,
              id: oldestMemMsg.key.id,
            };
            oldestMsgTimestampMs = syncMessageParser.getTimestamp(oldestMemMsg.messageTimestamp) * 1000;
            anchorSource = "Memory Store";
          } else {
            oldestMsgKey = { remoteJid: targetJid, fromMe: false, id: "" };
            oldestMsgTimestampMs = 0;
            anchorSource = "None (Invalid key fallback)";
          }
        } else {
          // Tier 3: Completely empty — unanchored request
          oldestMsgKey = { remoteJid: targetJid, fromMe: false, id: "" };
          oldestMsgTimestampMs = 0;
          anchorSource = "None (Unanchored Fallback)";
        }
      } else {
        oldestMsgKey = { remoteJid: targetJid, fromMe: false, id: "" };
        oldestMsgTimestampMs = 0;
        anchorSource = "None (No store)";
      }

      // [SEC] Strategy: Use fetchMessageHistory if available, else fall back to chatHistory
      const hasFetchHistory = typeof (sock as Record<string, unknown>).fetchMessageHistory === "function";

      if (hasFetchHistory) {
        Logger.info(
          `[ChatSync] Requesting ${limit} historical messages on-demand from WhatsApp for ${targetJid}. ` +
          `Resolved anchor from ${anchorSource}: msg ${oldestMsgKey.id} at ${oldestMsgTimestampMs > 0 ? new Date(oldestMsgTimestampMs).toISOString() : "0"}`
        );

        const fetchFn = (sock as unknown as { fetchMessageHistory: (count: number, key: import("@whiskeysockets/baileys").WAMessageKey, ts: number) => Promise<void> }).fetchMessageHistory;
        await fetchFn.call(sock, limit, oldestMsgKey, oldestMsgTimestampMs);
      } else {
        // Fallback: Use chatModify to request sync or presenceSubscribe to wake up the chat
        Logger.info(
          `[ChatSync] fetchMessageHistory NOT available. Requesting presence subscription for ${targetJid} to trigger sync.`
        );
        try {
          await sock.presenceSubscribe(targetJid);
        } catch (presErr) {
          Logger.debug(`[ChatSync] presenceSubscribe failed for ${targetJid}: ${presErr instanceof Error ? presErr.message : String(presErr)}`);
        }
      }

      // [ENTERPRISE] Dynamic wait: poll the store for new messages up to 8 seconds
      // instead of a fixed 5-second blind wait. Returns early if messages arrive.
      const MAX_WAIT_MS = 8000;
      const POLL_INTERVAL_MS = 500;
      const startWait = Date.now();

      while (Date.now() - startWait < MAX_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (store) {
          const currentCount = this.extractMessagesFromStore(store, undefined, targetJid).length;
          if (currentCount > preCount) {
            Logger.info(`[ChatSync] On-demand fetch completed: ${currentCount - preCount} new messages arrived in ${Date.now() - startWait}ms for ${targetJid}`);
            return true;
          }
        }
      }

      Logger.info(`[ChatSync] On-demand fetch completed (waited ${MAX_WAIT_MS}ms, no new messages in store) for ${targetJid}`);
      // Return true even if no new messages arrived in store —
      // the history might have been ingested directly to DB via messaging-history.set
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
    const cleanPhone = isGroup ? WhatsAppIdUtils.cleanChannelId(phone) : phone;
    const bestNameMsg = msgs.find(m => !m.key.fromMe && m.pushName);
    const { conversation, customerUserId } = await syncRepositoryHelper.ensureConversation({
      companyId,
      phone: cleanPhone,
      isGroup,
      name: isGroup ? undefined : (bestNameMsg?.pushName || undefined)
    });

    if (!conversation) return; // Skipped invalid phone (LID guard)

    const senderIdCache = new Map<string, string>();
    const { chatService } = await import("@/services/ChatService");

    // [GROUP NAMES] Pre-compute the best pushName per participant across the WHOLE
    // batch. A participant's first message often lacks a pushName (so it would be
    // cached as the bare phone number forever), while a later message in the same
    // batch carries the real WhatsApp name. Scan once so we always use the best name.
    const bestPushNameByJid = new Map<string, string>();
    if (isGroup) {
      for (const m of msgs) {
        if (m.key.fromMe || !m.pushName) continue;
        const pj = m.key.participant || WhatsAppIdUtils.getSenderJid(m);
        const cj = pj ? WhatsAppIdUtils.getCleanJid(pj) : null;
        if (cj && !bestPushNameByJid.has(cj)) bestPushNameByJid.set(cj, m.pushName);
      }
    }

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
        ...(parsed.contextInfo || {}),
        ...(parsed.isSystem ? { system: true } : {})
      };

      // Resolve sender for this specific message (crucial for group participant identification)
      let resolvedSenderId = adminId;
      if (parsed.direction === "OUTBOUND") {
        resolvedSenderId = adminId;
      } else if (isGroup) {
        const participantJid = msg.key.participant || WhatsAppIdUtils.getSenderJid(msg);
        const cleanParticipantJid = participantJid ? WhatsAppIdUtils.getCleanJid(participantJid) : null;
        
        if (cleanParticipantJid) {
          if (senderIdCache.has(cleanParticipantJid)) {
            resolvedSenderId = senderIdCache.get(cleanParticipantJid)!;
          } else {
            const senderPhone = WhatsAppIdUtils.getPhoneNumber(cleanParticipantJid);
            const resolvedName =
              msg.pushName ||
              bestPushNameByJid.get(cleanParticipantJid) ||
              (senderPhone ? `+${senderPhone}` : undefined);
            try {
              const user = await chatService.upsertWhatsAppUser({
                email: `${cleanParticipantJid.split("@")[0]}@whatsapp.user`,
                name: resolvedName || `+${senderPhone || "unknown"}`,
                companyId,
                phone: senderPhone,
                role: "USER",
              });
              resolvedSenderId = user.id;
              senderIdCache.set(cleanParticipantJid, resolvedSenderId);
            } catch (err) {
              Logger.warn(`[ChatSync] Failed to resolve group message sender ${cleanParticipantJid}:`, err);
              resolvedSenderId = adminId;
            }
          }
        } else {
          resolvedSenderId = customerUserId || adminId;
        }
      } else {
        resolvedSenderId = customerUserId || adminId;
      }

      validBatch.push({
        companyId,
        conversationId: conversation.id,
        whatsappMessageId: msg.key.id!,
        content: parsed.textContent,
        channel: Channel.WHATSAPP,
        direction: parsed.direction === "OUTBOUND" ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
        senderId: resolvedSenderId,
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

      // ENTERPRISE FIX: Fallback to raw LID prefix instead of dropping history!
      return jid.split("@")[0].split(":")[0];
    }

    // Normal @s.whatsapp.net JID → extract phone number
    return jid.split("@")[0].split(":")[0];
  }

  private async resolveStore(companyId: string, contacts?: HistoryContact[]): Promise<BaileysStore | null> {
    const sessionGroups = await whatsappSessionRepository.findByStatus("CONNECTED", [companyId]);
    const session = sessionGroups[0];
    const store = session ? await this.getSessionStore(session.sessionId) : null;
    
    if (store && store.lidToPhone) {
      if (contacts) {
        for (const c of contacts) {
          if (c.id && c.resolved && c.lid) {
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


  private async getSessionStore(sessionId: string): Promise<BaileysStore | null> {
    const { whatsappService } = await import("@/whatsapp");
    const store = whatsappService.getSessionStore(sessionId);
    return store as BaileysStore | null;
  }

  public async resolveRealJid(
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

  public extractMessagesFromStore(store: BaileysStore, since?: Date | string, targetJid?: string): WAMessage[] {
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


}

export const chatSyncIngest = new ChatSyncIngest();
