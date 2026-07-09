import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";
import {
  WAMessage,
  isJidBroadcast,
} from "@whiskeysockets/baileys";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { TenantContextManager } from "@/config/tenantContext";
import { syncMessageParser } from "./SyncMessageParser";
import { syncRepositoryHelper } from "./SyncRepositoryHelper";
import { chatSyncJidResolver, ChatSyncJidResolver } from "./ChatSyncJidResolver";
import { chatSyncBatchIngester, ChatSyncBatchIngester } from "./ChatSyncBatchIngester";

// Re-export types so existing consumers don't break
export type { BaileysStore, HistoryContact } from "./ChatSyncJidResolver";

export interface HistoryChat {
  id: string;
  name?: string | null;
  subject?: string | null;
}

/**
 * CHAT SYNC INGEST (Refactored for SRP)
 *
 * Responsibilities: Orchestration of history sync queues, context sync flow,
 * and on-demand WhatsApp history fetching.
 *
 * Delegated: ChatSyncJidResolver (JID/LID resolution, store access)
 * Delegated: ChatSyncBatchIngester (batch DB writes, reactions, message processing)
 */
export class ChatSyncIngest {
  private activeContextSyncs = new Set<string>();
  // [LOAD] Cooldown so opening a chat repeatedly doesn't fire an 8s on-demand fetch
  // every time (which otherwise hammers the DB/socket — observed in prod logs). Once a
  // conversation has attempted an on-demand backfill, skip re-attempts for this window.
  private contextSyncCooldown = new Map<string, number>();
  private static readonly CONTEXT_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

  // [POOL-SAFETY] Serial executor for history syncs. Baileys can fire many
  // `messaging-history.set` events in a burst (reconnect / full re-link), and each
  // sync runs hundreds of sequential DB round-trips. Running them concurrently
  // drained the Prisma pool (connection_limit=15) → every API request (incl. /health)
  // queued 20s and 408'd. Chaining them so AT MOST ONE runs at a time leaves the
  // pool free for live API traffic. Background sync slowing down is an acceptable
  // trade vs. taking the whole app down.
  private historySyncChain: Promise<void> = Promise.resolve();
  private pendingHistorySyncs = 0;

  private jidResolver: ChatSyncJidResolver = chatSyncJidResolver;
  private batchIngester: ChatSyncBatchIngester = chatSyncBatchIngester;

  // ------------------------------------------------
  // HISTORY SYNC (Bulk Ingest on Connection)
  // ------------------------------------------------

  async handleHistorySync(
    companyId: string,
    messages: WAMessage[],
    chats?: HistoryChat[],
    contacts?: import("./ChatSyncJidResolver").HistoryContact[],
    options?: { onDemand?: boolean },
  ): Promise<void> {
    if ((!messages || messages.length === 0) && (!chats || chats.length === 0)) return;

    if (options?.onDemand) {
      // ON_DEMAND syncs are scoped to 1 chat and use createMany+skipDuplicates, so they
      // won't exhaust the pool. Bypass the bulk queue so the user sees history immediately
      // instead of waiting 30-40s for all pending bulk batches to finish first.
      this.runHistorySync(companyId, messages, chats, contacts, options).catch((err) => {
        Logger.error(`[ChatSync] On-demand history ingest failed:`, err);
      });
      return;
    }

    // Enqueue onto the serial chain (fire-and-forget — keep the socket handler non-blocking).
    this.pendingHistorySyncs++;
    this.historySyncChain = this.historySyncChain
      .catch(() => {}) // never let one failure break the chain
      .then(() => this.runHistorySync(companyId, messages, chats, contacts, options))
      .finally(() => {
        this.pendingHistorySyncs--;
      });
  }

  private async runHistorySync(
    companyId: string,
    messages: WAMessage[],
    chats?: HistoryChat[],
    contacts?: import("./ChatSyncJidResolver").HistoryContact[],
    options?: { onDemand?: boolean },
  ): Promise<void> {
    await TenantContextManager.run(
      { companyId, userId: "system", requestId: `history-sync-${companyId}` },
      async () => {
        try {
          Logger.info(
            `[ChatSync] History Ingest Started | ${messages?.length || 0} msgs, ${chats?.length || 0} chats (queued: ${this.pendingHistorySyncs - 1})`,
          );

          const store = await this.jidResolver.resolveStore(companyId, contacts);
          const admin = await syncRepositoryHelper.getAdminUser(companyId);
          if (!admin) return;

          // 1. Identity Discovery
          if (chats) {
            for (const chat of chats) {
              const phone = this.jidResolver.resolveJid(chat.id, store);
              if (phone && !isJidBroadcast(chat.id) && !chat.id.includes("@newsletter")) {
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

          // [PERF] Cap maximum history sync messages on low-memory containers (Render/Heroku)
          // to prevent OOM. We prioritize the most recent messages.
          let messagesToProcess = messages;
          const MAX_MESSAGES = parseInt(process.env.MAX_HISTORY_SYNC_MESSAGES || "1500", 10);
          if (!options?.onDemand && messages.length > MAX_MESSAGES) {
            Logger.info(
              `[ChatSync] [MEMORY-LIMIT] Capping history messages from ${messages.length} to ${MAX_MESSAGES} to prevent OOM.`
            );
            messagesToProcess = [...messages]
              .sort((a, b) => {
                const tsA = typeof a.messageTimestamp === "number" ? a.messageTimestamp : 0;
                const tsB = typeof b.messageTimestamp === "number" ? b.messageTimestamp : 0;
                return tsB - tsA; // newest first
              })
              .slice(0, MAX_MESSAGES)
              .reverse(); // back to chronological
          }

          // 2. Group Messages by Conversation
          const msgsByPhone = this.jidResolver.groupMessagesByPhone(messagesToProcess, store);

          // 3. Process each conversation. Yield to the event loop between conversations
          // so the API stays responsive even during a large sync.
          for (const [phone, chatMsgs] of msgsByPhone.entries()) {
            // [FIX] One conversation's batch failing (e.g. a constraint error not
            // caught by the batch ingester) used to propagate to this loop's caller,
            // aborting history sync for every OTHER conversation still pending in
            // this event. Isolate failures per-conversation instead.
            let conversationId: string | null = null;
            try {
              conversationId = await this.batchIngester.ingestConversationBatch(companyId, phone, chatMsgs, admin.id);
            } catch (convErr) {
              Logger.error(`[ChatSync] Failed to ingest batch for ${phone} (company ${companyId}):`, {
                error: convErr instanceof Error ? convErr.message : String(convErr),
              });
            }
            // On-demand backfill: tell the frontend to refetch this chat now that
            // older messages have landed in the DB (handles batches that arrive after
            // the HTTP sync request already returned).
            if (options?.onDemand && conversationId) {
              gateway.emitToCompany(companyId, "conversation:history_synced", {
                conversationId,
                newMessages: chatMsgs.length,
              });
            }
            // [MEDIA] Ingest persists media as `_unavailable` placeholders (downloading
            // inline would block the batch). Hydrate them in the background so synced
            // media actually renders instead of staying "no disponible" forever.
            if (conversationId) {
              const { syncMediaService } = await import("./SyncMediaService");
              syncMediaService.scheduleHydration(
                companyId,
                conversationId,
                options?.onDemand ? 25 : 10,
              );
            }
            await new Promise((r) => setImmediate(r));
            
            // [HEAP] Proactively clean dereferenced objects on memory-constrained platforms
            if (global.gc) {
              try {
                global.gc();
              } catch (e) {
                // Garbage collection is best-effort; ignore errors
              }
            }
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

    // [LOAD] Skip if we already attempted a backfill for this chat recently. Prevents the
    // 8s on-demand fetch from re-running on every chat re-open (a major source of DB load).
    const lastAttempt = this.contextSyncCooldown.get(lockKey);
    if (lastAttempt && Date.now() - lastAttempt < ChatSyncIngest.CONTEXT_SYNC_COOLDOWN_MS) {
      return;
    }
    this.contextSyncCooldown.set(lockKey, Date.now());

    this.activeContextSyncs.add(lockKey);
    gateway.emitToCompany(companyId, "conversation:sync_started", { conversationId, channelId, type: "chat_context" });

    let syncedCount = 0;

    try {
      const { whatsappService } = await import("@/whatsapp");
      const session = (await whatsappService.getSessions(companyId))?.find(s => s.status === "CONNECTED");
      if (!session) return;

      const store = await this.jidResolver.getSessionStore(session.sessionId);
      if (!store) return;

      const admin = await syncRepositoryHelper.getAdminUser(companyId);
      if (!admin) return;

      const { messageRepository } = await import("@/repositories/MessageRepository");
      const cleanPhone = WhatsAppIdUtils.cleanChannelId(channelId);
      const dbCountBefore = await messageRepository.count({
        where: { companyId, conversation: { channelId: cleanPhone } }
      });

      let targetJid = WhatsAppIdUtils.getTargetJid(channelId);
      targetJid = await this.jidResolver.resolveRealJid(companyId, session.sessionId, targetJid);
      let messages = this.jidResolver.extractMessagesFromStore(store, undefined, targetJid);

      let fetchSuccess = false;

      // If memory store has fewer than 15 messages, fetch on-demand from WhatsApp to backfill history
      if (messages.length < 15) {
        Logger.info(`[ContextSync] Only ${messages.length} messages in memory for ${channelId}, fetching on-demand from WhatsApp...`);
        fetchSuccess = await this.fetchHistoryFromWhatsApp(companyId, session.sessionId, channelId, 500);
        if (fetchSuccess) {
          // Re-extract from store now that history sync event has updated it
          messages = this.jidResolver.extractMessagesFromStore(store, undefined, targetJid);
        }

        // [ENTERPRISE] If memory store STILL has few messages, the on-demand fetch may have
        // gone through the messaging-history.set → DB pipeline instead of populating the store.
        // In that case, messages are already in the DB and will appear on the next query refresh.
        // Emit the sync_completed event to force the frontend to refetch conversation data.
        if (messages.length < 5) {
          Logger.info(`[ContextSync] Memory store still sparse (${messages.length} msgs). Triggering frontend refresh.`);
        }
      }

      if (fetchSuccess) {
        // If we successfully fetched from WhatsApp, the socket listener messaging-history.set
        // has already bulk-inserted the messages into the DB. Calculate count difference.
        const dbCountAfter = await messageRepository.count({
          where: { companyId, conversation: { channelId: cleanPhone } }
        });
        syncedCount = Math.max(0, dbCountAfter - dbCountBefore);
      } else {
        // Use the batch path (createMany + skipDuplicates) instead of per-message
        // findFirst+create, which would take 20-30s for 500 messages on a remote DB.
        const recent = messages.slice(-500);
        if (recent.length > 0) {
          const convId = await this.batchIngester.ingestConversationBatch(companyId, channelId, recent, admin.id);
          if (convId) {
            syncedCount = recent.length;
            const { syncMediaService } = await import("./SyncMediaService");
            syncMediaService.scheduleHydration(companyId, convId, 25);
          }
        }
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

  // ------------------------------------------------
  // ON-DEMAND WHATSAPP HISTORY FETCH
  // ------------------------------------------------

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
      targetJid = await this.jidResolver.resolveRealJid(companyId, sessionId, targetJid);

      const { messageRepository } = await import("@/repositories/MessageRepository");
      const cleanPhone = WhatsAppIdUtils.cleanChannelId(channelId);
      const store = await this.jidResolver.getSessionStore(sessionId);

      const countInDb = () => messageRepository.count({
        where: { companyId, conversation: { channelId: cleanPhone } }
      });

      // Resolve the backward-pagination anchor: the OLDEST message we know about.
      // fetchMessageHistory fetches messages BEFORE the cursor, so anchoring on the
      // oldest message extends our history further into the past. Re-resolved on
      // every page so each request continues where the previous batch landed.
      const resolveAnchor = async (): Promise<{
        key: import("@whiskeysockets/baileys").WAMessageKey;
        tsMs: number;
        source: string;
      }> => {
        const anchorMsg = await messageRepository.findFirst({
          where: { companyId, conversation: { channelId: cleanPhone } },
          orderBy: { createdAt: "asc" }, // Oldest message first
        });

        if (anchorMsg?.whatsappMessageId) {
          return {
            key: {
              remoteJid: targetJid,
              fromMe: anchorMsg.direction === "OUTBOUND",
              id: anchorMsg.whatsappMessageId,
            },
            tsMs: new Date(anchorMsg.createdAt).getTime(),
            source: "Database (oldest msg)",
          };
        }
        if (store) {
          // Tier 2: Search Baileys Memory Store for anchor message
          const memMessages = this.jidResolver.extractMessagesFromStore(store, undefined, targetJid);
          const oldestMemMsg = memMessages?.[0]; // Already sorted by timestamp asc
          if (oldestMemMsg?.key?.id) {
            return {
              key: {
                remoteJid: targetJid,
                fromMe: oldestMemMsg.key.fromMe || false,
                id: oldestMemMsg.key.id,
              },
              tsMs: syncMessageParser.getTimestamp(oldestMemMsg.messageTimestamp) * 1000,
              source: "Memory Store (oldest msg)",
            };
          }
        }
        // Tier 3: Completely empty — unanchored request
        return { key: { remoteJid: targetJid, fromMe: false, id: "" }, tsMs: 0, source: "None (Unanchored Fallback)" };
      };

      // [SEC] Strategy: Use fetchMessageHistory if available, else fall back to presence wake-up
      const hasFetchHistory = typeof (sock as Record<string, unknown>).fetchMessageHistory === "function";

      if (!hasFetchHistory) {
        Logger.info(
          `[ChatSync] fetchMessageHistory NOT available. Requesting presence subscription for ${targetJid} to trigger sync.`
        );
        try {
          await sock.presenceSubscribe(targetJid);
        } catch (presErr) {
          Logger.debug(`[ChatSync] presenceSubscribe failed for ${targetJid}: ${presErr instanceof Error ? presErr.message : String(presErr)}`);
        }
        return true;
      }

      // [ENTERPRISE] Wait for the batch: poll the DB count until new messages arrive.
      // fetchMessageHistory is a peer-data-operation request to the LINKED PHONE (not
      // WhatsApp's servers) — it has to wake up, relay potentially dozens of messages,
      // and round-trip back, which routinely takes >8s on a locked/backgrounded phone.
      // After growth is detected, keep polling until the count is stable so the whole
      // batch lands before we re-anchor for the next page.
      const MAX_WAIT_MS = 20000;
      const POLL_INTERVAL_MS = 500;
      const STABLE_MS = 2500;
      const MAX_STABILIZE_MS = 10000;

      const waitForBatch = async (preCount: number, stabilize: boolean): Promise<number> => {
        const startWait = Date.now();
        let lastCount = preCount;
        while (Date.now() - startWait < MAX_WAIT_MS) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          lastCount = await countInDb();
          if (lastCount > preCount) break;
        }
        if (lastCount <= preCount) return 0;
        if (!stabilize) return lastCount - preCount;

        // Growth detected — wait until it stabilizes (no growth for STABLE_MS) so the
        // whole batch lands before the caller re-anchors for the next page.
        const stabilizeStart = Date.now();
        let lastGrowthAt = Date.now();
        while (Date.now() - stabilizeStart < MAX_STABILIZE_MS && Date.now() - lastGrowthAt < STABLE_MS) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          const current = await countInDb();
          if (current > lastCount) {
            lastCount = current;
            lastGrowthAt = Date.now();
          }
        }
        return lastCount - preCount;
      };

      const fetchFn = (sock as unknown as { fetchMessageHistory: (count: number, key: import("@whiskeysockets/baileys").WAMessageKey, ts: number) => Promise<void> }).fetchMessageHistory;

      const fetchPage = async (pageLabel: string, count: number, stabilize: boolean): Promise<number> => {
        const anchor = await resolveAnchor();
        const preDbCount = await countInDb();
        Logger.info(
          `[ChatSync] On-demand ${pageLabel}: requesting ${count} messages for ${targetJid}. ` +
          `Anchor from ${anchor.source}: msg ${anchor.key.id} at ${anchor.tsMs > 0 ? new Date(anchor.tsMs).toISOString() : "0"}`
        );
        await fetchFn.call(sock, count, anchor.key, Math.floor(anchor.tsMs / 1000));
        return waitForBatch(preDbCount, stabilize);
      };

      // [COMPLETENESS] A single fetchMessageHistory returns ONE page (the phone decides
      // its size, typically ~50 msgs). The old code fired one request and returned at the
      // first arrival, so "sincronizar" barely scratched the history ("omite mensajes").
      // Page 1 runs synchronously (fast HTTP response, same latency as before); the
      // remaining pages paginate backwards IN BACKGROUND until the requested limit is
      // covered or the phone has no more. Each background batch is ingested through the
      // ON_DEMAND messaging-history.set path, which emits conversation:history_synced —
      // the frontend already refetches the chat on that event.
      const MAX_PAGES = 5;
      const firstGained = await fetchPage("page 1", limit, false);

      if (firstGained > 0 && firstGained < limit) {
        (async () => {
          // Let page 1's batch fully land before re-anchoring
          await new Promise((r) => setTimeout(r, STABLE_MS));
          let totalGained = firstGained;
          for (let page = 2; page <= MAX_PAGES && totalGained < limit; page++) {
            const gained = await fetchPage(`page ${page}/${MAX_PAGES} (background)`, Math.max(50, limit - totalGained), true);
            if (gained <= 0) {
              Logger.info(`[ChatSync] On-demand background pagination finished for ${targetJid}: no more messages from phone.`);
              break;
            }
            totalGained += gained;
            Logger.info(`[ChatSync] On-demand background page landed ${gained} messages (${totalGained}/${limit}) for ${targetJid}`);
          }
        })().catch((err) => {
          Logger.warn(`[ChatSync] Background pagination failed for ${targetJid}: ${err instanceof Error ? err.message : String(err)}`);
        });
      }

      Logger.info(`[ChatSync] On-demand fetch (page 1) completed: ${firstGained} new messages for ${targetJid}`);
      // Return true even if no new messages arrived in DB —
      // the history might have been ingested directly to DB via messaging-history.set
      return true;
    } catch (err) {
      Logger.warn(`[ChatSync] fetchHistoryFromWhatsApp failed for ${channelId}:`, { error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  // ────────────────────────────────────────────────
  // DELEGATION PASSTHROUGH (Public API Compatibility)
  // ────────────────────────────────────────────────

  /** @deprecated Use chatSyncBatchIngester.processMessage directly in new code */
  async processMessage(
    companyId: string,
    channelId: string,
    msg: WAMessage,
    dryRun: boolean,
    fallbackSenderId: string
  ): Promise<"new" | "duplicate" | "skipped"> {
    return this.batchIngester.processMessage(companyId, channelId, msg, dryRun, fallbackSenderId);
  }

  /** @deprecated Use chatSyncJidResolver.resolveRealJid directly in new code */
  public async resolveRealJid(
    companyId: string,
    sessionId: string,
    targetJid: string
  ): Promise<string> {
    return this.jidResolver.resolveRealJid(companyId, sessionId, targetJid);
  }

  /** @deprecated Use chatSyncJidResolver.extractMessagesFromStore directly in new code */
  public extractMessagesFromStore(
    store: import("./ChatSyncJidResolver").BaileysStore,
    since?: Date | string,
    targetJid?: string
  ): WAMessage[] {
    return this.jidResolver.extractMessagesFromStore(store, since, targetJid);
  }

  /** @internal Used by ChatSyncService via bracket access */
  private async getSessionStore(sessionId: string) {
    return this.jidResolver.getSessionStore(sessionId);
  }
}

export const chatSyncIngest = new ChatSyncIngest();
