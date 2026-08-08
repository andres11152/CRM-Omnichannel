import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";
import {
  WAMessage,
  isJidBroadcast,
} from "@whiskeysockets/baileys";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { TenantContextManager } from "@/config/tenantContext";
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
  // Tracks which lockKeys' last attempt was a genuine fetch (vs an infra
  // early-exit) — determines which of the two cooldown windows applies.
  private contextSyncFullAttempt = new Set<string>();
  private static readonly CONTEXT_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
  // Short retry window for attempts that never got past infra checks (no
  // CONNECTED session yet, store not ready, no admin user) — those are
  // transient conditions that can resolve within seconds, and it was never
  // an actual WhatsApp/DB round-trip that needs the long cooldown's
  // protection. The full cooldown above still applies once a real fetch
  // attempt happens, successful or not.
  private static readonly CONTEXT_SYNC_INFRA_RETRY_MS = 30 * 1000;

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
    lidPnMappings?: import("./ChatSyncJidResolver").LidPnMapping[],
  ): Promise<void> {
    if ((!messages || messages.length === 0) && (!chats || chats.length === 0)) return;

    // [SEC · REDIS-DURABILITY] MUST be genuinely awaited — the only caller is
    // historySyncWorker.ts's BullMQ job processor, which marks the job COMPLETE
    // (removeOnComplete deletes it from Redis) the instant this promise resolves.
    // This used to fire real ingestion onto an in-process promise chain and
    // return immediately, so BullMQ deleted the job — and its only durable
    // record of "this batch still needs processing" — before a single message
    // was persisted. A crash/restart/OOM between that false "completed" log and
    // the real DB writes lost the batch permanently with zero trace in Redis.
    // Observed in production: batches of ~4,700 messages logged "Ingested
    // history sync job N successfully" while genuinely landing 0 rows.
    // The worker's own `concurrency: 1` (HistorySyncWorker) already serializes
    // DB load across jobs, so no separate in-process chain is needed for that.
    await this.runHistorySync(companyId, messages, chats, contacts, options, lidPnMappings);
  }

  private async runHistorySync(
    companyId: string,
    messages: WAMessage[],
    chats?: HistoryChat[],
    contacts?: import("./ChatSyncJidResolver").HistoryContact[],
    options?: { onDemand?: boolean },
    lidPnMappings?: import("./ChatSyncJidResolver").LidPnMapping[],
  ): Promise<void> {
    await TenantContextManager.run(
      { companyId, userId: "system", requestId: `history-sync-${companyId}` },
      async () => {
        // [SEC] Deliberately NOT wrapped in a swallowing try/catch anymore — a
        // fatal failure here (e.g. DB pool exhausted, connection dropped) must
        // propagate to historySyncWorker.ts so BullMQ marks the job FAILED and
        // retries it (attempts: 3, exponential backoff) instead of silently
        // logging "Fatal History Ingest Failure" while BullMQ deletes the job
        // as if it had succeeded. Retrying a partially-completed batch is safe:
        // `ingestConversationBatch` writes via createMany({skipDuplicates:true})
        // against the @@unique([companyId, whatsappMessageId]) constraint, so
        // already-persisted messages are silently skipped, not duplicated.
        Logger.info(
          `[ChatSync] History Ingest Started | ${messages?.length || 0} msgs, ${chats?.length || 0} chats, ${lidPnMappings?.length || 0} lid-pairs`,
        );

        // [SEC] `store` is ALWAYS null in this process — the Baileys in-memory
        // store lives exclusively in whatsapp-service post microservice-split.
        // lidPhoneMap is the real resolution source now (see buildLidPhoneMap).
        const store = null;
        const lidPhoneMap = await this.jidResolver.buildLidPhoneMap(companyId, lidPnMappings, contacts);

        // Persist newly-learned mappings so the live-message pipeline and future
        // syncs can resolve this contact without needing another history batch
        // (mirrors IdentityResolverService's best-effort save on the live path).
        if (lidPnMappings?.length) {
          const { chatService } = await import("@/services/ChatService");
          for (const { lid, pn } of lidPnMappings) {
            if (!lid || !pn) continue;
            chatService
              .saveLidPhoneMapping(companyId, lid.split("@")[0].split(":")[0], pn.split("@")[0].split(":")[0])
              .catch(() => {});
          }
        }

        const admin = await syncRepositoryHelper.getAdminUser(companyId);
        if (!admin) return;

        // 1. Identity Discovery. Per-chat try/catch so one malformed chat entry
        // can't abort (and force a full BullMQ retry of) the whole batch.
        let unresolvedChats = 0;
        if (chats) {
          for (const chat of chats) {
            try {
              const phone = this.jidResolver.resolveJid(chat.id, store, lidPhoneMap);
              if (phone && !isJidBroadcast(chat.id) && !chat.id.includes("@newsletter")) {
                const isGroup = chat.id.endsWith("@g.us");
                const cleanPhone = isGroup ? WhatsAppIdUtils.cleanChannelId(phone) : phone;
                await syncRepositoryHelper.ensureConversation({
                  companyId,
                  phone: cleanPhone,
                  name: chat.name || chat.subject || undefined,
                  isGroup
                });
              } else if (!phone && chat.id.includes("@lid")) {
                unresolvedChats++;
              }
            } catch (chatErr) {
              Logger.error(`[ChatSync] Failed to process chat ${chat.id} (company ${companyId}):`, {
                error: chatErr instanceof Error ? chatErr.message : String(chatErr),
              });
            }
          }
        }
        if (unresolvedChats > 0) {
          Logger.warn(`[ChatSync] ${unresolvedChats} LID chat(s) had no phone mapping and were skipped for company ${companyId}`);
        }

        if (!messages || messages.length === 0) {
          Logger.info(`[ChatSync] History Ingest Complete for ${companyId}`);
          return;
        }

        // [PERF] Process large batches in ordered chunks instead of one giant
        // pass — bounds how much conversation-batch state is in flight at once
        // and gives the event loop a yield point even for one pathologically
        // large conversation, WITHOUT ever discarding a message. This used to
        // `.slice(0, MAX_MESSAGES)` after sorting newest-first, silently
        // discarding everything past the cap — observed losing ~68% of every
        // reconnect's history batch (thousands of messages per batch, gone
        // with no trace, no retry, no log beyond a terse "Capping..." line).
        const { syncMessageParser } = await import("./SyncMessageParser");
        const CHUNK_SIZE = parseInt(process.env.MAX_HISTORY_SYNC_MESSAGES || "1500", 10);
        const orderedMessages = [...messages].sort(
          (a, b) => syncMessageParser.getTimestamp(a.messageTimestamp) - syncMessageParser.getTimestamp(b.messageTimestamp),
        );

        let totalUnresolved = 0;

        for (let i = 0; i < orderedMessages.length; i += CHUNK_SIZE) {
          const chunk = orderedMessages.slice(i, i + CHUNK_SIZE);

          // 2. Group this chunk's messages by conversation
          const msgsByPhone = this.jidResolver.groupMessagesByPhone(chunk, store, lidPhoneMap);
          totalUnresolved += chunk.length - Array.from(msgsByPhone.values()).reduce((n, m) => n + m.length, 0);

          // 3. Process each conversation. Yield to the event loop between
          // conversations so the API stays responsive even during a large sync.
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
              } catch {
                // Garbage collection is best-effort; ignore errors
              }
            }
          }
        }

        if (totalUnresolved > 0) {
          Logger.warn(`[ChatSync] ${totalUnresolved} message(s) unresolved (LID with no phone mapping, or broadcast/newsletter JID) for company ${companyId}`);
        }
        Logger.info(`[ChatSync] History Ingest Complete for ${companyId} | ${messages.length} received, ${totalUnresolved} unresolved`);
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
    // The window differs by outcome (see `attempted` below): a real fetch attempt gets the
    // full cooldown; an early exit before we ever touched WhatsApp/DB gets a short one, since
    // that's usually a transient condition (session still reconnecting, store warming up).
    const lastAttempt = this.contextSyncCooldown.get(lockKey);
    if (lastAttempt) {
      const isFullCooldown = this.contextSyncFullAttempt.has(lockKey);
      const window = isFullCooldown
        ? ChatSyncIngest.CONTEXT_SYNC_COOLDOWN_MS
        : ChatSyncIngest.CONTEXT_SYNC_INFRA_RETRY_MS;
      if (Date.now() - lastAttempt < window) return;
    }

    this.activeContextSyncs.add(lockKey);
    gateway.emitToCompany(companyId, "conversation:sync_started", { conversationId, channelId, type: "chat_context" });

    let syncedCount = 0;
    let attempted = false;
    let errored = false;
    let failureReason: string | undefined;

    try {
      const { whatsappService } = await import("@/whatsapp");
      const session = (await whatsappService.getSessions(companyId))?.find(s => s.status === "CONNECTED");
      if (!session) { failureReason = "no_connected_session"; return; }

      // [SEC] The Baileys in-memory store lives exclusively in whatsapp-service
      // now — this process's store is never populated (see SessionManager's
      // sessionStores Map, which nothing ever writes to post microservice-split),
      // so getSessionStore() always resolved null here. That used to be treated
      // as an infra failure that aborted the whole sync; fetchHistoryFromWhatsApp()
      // doesn't actually need this store at all — it anchors pagination off the
      // DB and dispatches via HTTP command — so the check below no longer depends
      // on it either.
      //
      // No direct ingestion happens here anymore (see removed else-branch below) —
      // this guard just avoids burning a WhatsApp round-trip for a company with
      // no admin user, since runHistorySync() would silently no-op on the same
      // check once the fetched batch lands via messaging-history.set.
      const hasAdmin = await syncRepositoryHelper.getAdminUser(companyId);
      if (!hasAdmin) { failureReason = "no_admin_user"; return; }

      // Past this point we're making a genuine attempt (a real WhatsApp/DB
      // round-trip) — from here on, a 0-result outcome is a legitimate
      // "nothing to backfill", not an infra failure, and earns the long cooldown.
      attempted = true;

      const { messageRepository } = await import("@/repositories/MessageRepository");
      const cleanPhone = WhatsAppIdUtils.cleanChannelId(channelId);
      const dbCountBefore = await messageRepository.count({
        where: { companyId, conversation: { channelId: cleanPhone } }
      });

      let fetchSuccess = false;

      // Backfill from WhatsApp when this conversation is thin in the DB — the
      // in-memory store is never populated in this process (see above), so the
      // threshold has to be based on what we actually have persisted, not on
      // extractMessagesFromStore() (which would always read 0 here).
      if (dbCountBefore < 15) {
        Logger.info(`[ContextSync] Only ${dbCountBefore} messages in DB for ${channelId}, fetching on-demand from WhatsApp...`);
        fetchSuccess = await this.fetchHistoryFromWhatsApp(companyId, session.sessionId, channelId, 500);
      }

      if (fetchSuccess) {
        // If we successfully fetched from WhatsApp, the socket listener messaging-history.set
        // has already bulk-inserted the messages into the DB. Calculate count difference.
        const dbCountAfter = await messageRepository.count({
          where: { companyId, conversation: { channelId: cleanPhone } }
        });
        syncedCount = Math.max(0, dbCountAfter - dbCountBefore);
      }
      // else: either the conversation already had ≥15 DB messages (nothing to
      // backfill) or the fetch attempt itself failed (already logged inside
      // fetchHistoryFromWhatsApp). Either way syncedCount stays 0 — there's no
      // local store to fall back to ingesting from (see comment above).
    } catch (err: unknown) {
      errored = true;
      failureReason = "error";
      Logger.error(`[ContextSync] ERROR: Failed for ${channelId}:`, {
        companyId,
        channelId,
        conversationId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
    } finally {
      this.activeContextSyncs.delete(lockKey);
      this.contextSyncCooldown.set(lockKey, Date.now());
      if (attempted) {
        this.contextSyncFullAttempt.add(lockKey);
      } else {
        this.contextSyncFullAttempt.delete(lockKey);
      }
      // ALWAYS emit finished event to unlock the UI, even if it returns early or fails!
      // `failed` only covers genuine infra failures or exceptions — a clean attempt
      // that simply found nothing new is NOT "failed", it's the common case, and
      // stays silent on the frontend to avoid a toast on every chat open.
      const failed = !attempted || errored;
      gateway.emitToCompany(companyId, "conversation:history_synced", {
        conversationId,
        channelId,
        newMessages: syncedCount,
        failed,
        failureReason: failed ? failureReason : undefined,
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
    limit: number = 100,
    opts?: {
      /** Max ms to block the CALLER waiting for page 1. Callers inside an HTTP request
       * (manual sync) must respond before the frontend's 15s axios timeout; the full
       * wait + deeper pagination always continues in background so nothing is lost. */
      firstPageWaitMs?: number;
    }
  ): Promise<boolean> {
    try {
      // [SEC] The Baileys socket lives exclusively in whatsapp-service now — this
      // process can only check session status over HTTP and ask whatsapp-service
      // to perform the actual fetchMessageHistory call on the live socket.
      const { whatsappService } = await import("@/whatsapp");
      const sessions = await whatsappService.listSessions(companyId);
      const activeSession = sessions.find((s) => s.status === "CONNECTED");
      if (!activeSession) {
        Logger.warn(`[ChatSync] No active session for company ${companyId}`);
        return false;
      }

      const { executeWhatsAppCommand } = await import("@/whatsapp/utils/whatsAppServiceHttp");
      const requestHistoryPage = (
        count: number,
        key: import("@whiskeysockets/baileys").WAMessageKey,
        tsMs: number,
      ) =>
        executeWhatsAppCommand<{ usedFallback: boolean }>(companyId, "fetchMessageHistory", [count, key, tsMs]);

      let targetJid = WhatsAppIdUtils.getTargetJid(channelId);
      targetJid = await this.jidResolver.resolveRealJid(companyId, sessionId, targetJid);

      const { messageRepository } = await import("@/repositories/MessageRepository");
      const cleanPhone = WhatsAppIdUtils.cleanChannelId(channelId);

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
          // [SEC] Anchor with the JID this SPECIFIC message actually arrived
          // under (persisted at ingest time), not the globally re-resolved
          // targetJid — fetchMessageHistory forwards this key verbatim as a
          // peer-data-operation reference the phone looks up in its OWN chat
          // history; a remoteJid/id pair split across two different addressing
          // schemes (e.g. targetJid settled on @s.whatsapp.net via a live
          // onWhatsApp check while this message actually lives under @lid) is
          // not a message the phone can find, and it silently drops the
          // request — this was the root cause of "solicita al celular pero
          // nunca funciona" for exactly the conversations where targetJid
          // didn't happen to resolve to the same scheme the history was
          // ingested under.
          const meta = anchorMsg.metadata as Record<string, unknown> | null;
          const anchorJid =
            (typeof meta?.remoteJid === "string" && meta.remoteJid) ||
            (typeof meta?.senderJid === "string" && meta.senderJid.includes("@lid") && meta.senderJid) ||
            targetJid;
          return {
            key: {
              remoteJid: anchorJid,
              fromMe: anchorMsg.direction === "OUTBOUND",
              id: anchorMsg.whatsappMessageId,
            },
            tsMs: new Date(anchorMsg.createdAt).getTime(),
            source: anchorJid === targetJid ? "Database (oldest msg)" : "Database (oldest msg, original JID)",
          };
        }
        // No DB anchor and no local memory store to fall back to (the Baileys
        // store lives exclusively in whatsapp-service) — unanchored request.
        return { key: { remoteJid: targetJid, fromMe: false, id: "" }, tsMs: 0, source: "None (Unanchored Fallback)" };
      };

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

      const waitForBatch = async (preCount: number, stabilize: boolean, maxWaitMs: number = MAX_WAIT_MS): Promise<number> => {
        const startWait = Date.now();
        let lastCount = preCount;
        while (Date.now() - startWait < maxWaitMs) {
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

      // [Baileys 7 · CRITICAL] fetchMessageHistory's 3rd argument is forwarded VERBATIM
      // into historySyncOnDemandRequest.oldestMsgTimestampMs (see baileys
      // lib/Socket/messages-recv.js) — it must be MILLISECONDS. The previous code passed
      // seconds (tsMs/1000), so the phone was asked for history older than ~1970 and
      // answered with nothing: this is why manual/on-demand sync "no funciona".
      //
      // [Baileys 7 · CRITICAL #2] The official docs (README.md "Query Chat History")
      // state the `count` argument is capped at 50 per query: "quantity (max: 50 per
      // query)". This is enforced by the LINKED PHONE, not by the library — Baileys
      // forwards whatever number we pass straight into the PDO request with no client
      // side clamp. Requesting more than 50 (we were sending 100-500) makes the phone
      // silently drop the on-demand request instead of answering: the toast confirms
      // the request was *sent*, but no messaging-history.set batch ever comes back.
      // Every fetchMessageHistory call below must stay at or under this cap; deeper
      // history is covered by requesting more 50-message pages, not a bigger count.
      const MAX_PER_QUERY = 50;

      const fetchPage = async (pageLabel: string, count: number, stabilize: boolean): Promise<number> => {
        const clampedCount = Math.min(count, MAX_PER_QUERY);
        const anchor = await resolveAnchor();
        const preDbCount = await countInDb();
        Logger.info(
          `[ChatSync] On-demand ${pageLabel}: requesting ${clampedCount} messages for ${targetJid}. ` +
          `Anchor from ${anchor.source}: msg ${anchor.key.id} at ${anchor.tsMs > 0 ? new Date(anchor.tsMs).toISOString() : "0"}`
        );
        await requestHistoryPage(clampedCount, anchor.key, anchor.tsMs);
        return waitForBatch(preDbCount, stabilize);
      };

      // [COMPLETENESS] A single fetchMessageHistory returns AT MOST 50 messages (phone
      // enforced, see MAX_PER_QUERY above). The old code fired one uncapped request and
      // returned at the first arrival, so "sincronizar" barely scratched the history
      // ("omite mensajes") when it wasn't silently ignored outright for exceeding 50.
      // Page 1 blocks the caller only up to firstPageWaitMs (bounded for HTTP callers);
      // the remaining pages paginate backwards IN BACKGROUND until the requested limit is
      // covered or the phone has no more. Each background batch is ingested through the
      // ON_DEMAND messaging-history.set path, which emits conversation:history_synced —
      // the frontend already refetches the chat on that event.
      const MAX_PAGES = Math.min(20, Math.max(1, Math.ceil(limit / MAX_PER_QUERY)));
      const firstPageWaitMs = Math.min(opts?.firstPageWaitMs ?? MAX_WAIT_MS, MAX_WAIT_MS);

      const page1Count = Math.min(limit, MAX_PER_QUERY);
      const anchor1 = await resolveAnchor();
      const page1PreCount = await countInDb();
      Logger.info(
        `[ChatSync] On-demand page 1: requesting ${page1Count} messages for ${targetJid}. ` +
        `Anchor from ${anchor1.source}: msg ${anchor1.key.id} at ${anchor1.tsMs > 0 ? new Date(anchor1.tsMs).toISOString() : "0"}`
      );
      const page1Result = await requestHistoryPage(page1Count, anchor1.key, anchor1.tsMs);
      if (page1Result.usedFallback) {
        // whatsapp-service's socket doesn't support fetchMessageHistory — it already
        // fell back to presenceSubscribe (best-effort wake-up), no batch to wait for.
        Logger.info(`[ChatSync] fetchMessageHistory unavailable for ${targetJid}; used presence-subscribe fallback.`);
        return true;
      }
      const firstGained = await waitForBatch(page1PreCount, false, firstPageWaitMs);

      const paginateRemaining = async (initialGained: number) => {
        // Let the previous batch fully land before re-anchoring
        await new Promise((r) => setTimeout(r, STABLE_MS));
        let totalGained = initialGained;
        for (let page = 2; page <= MAX_PAGES && totalGained < limit; page++) {
          const gained = await fetchPage(`page ${page}/${MAX_PAGES} (background)`, Math.min(MAX_PER_QUERY, limit - totalGained), true);
          if (gained <= 0) {
            Logger.info(`[ChatSync] On-demand background pagination finished for ${targetJid}: no more messages from phone.`);
            break;
          }
          totalGained += gained;
          Logger.info(`[ChatSync] On-demand background page landed ${gained} messages (${totalGained}/${limit}) for ${targetJid}`);
        }
      };

      if (firstGained > 0 && firstGained < limit) {
        paginateRemaining(firstGained).catch((err) => {
          Logger.warn(`[ChatSync] Background pagination failed for ${targetJid}: ${err instanceof Error ? err.message : String(err)}`);
        });
      } else if (firstGained === 0 && firstPageWaitMs < MAX_WAIT_MS) {
        // Bounded wait expired before the phone answered (routine on a locked phone).
        // Keep waiting in background for the remainder of the full window: the batch is
        // ingested by messaging-history.set regardless of this waiter, and this
        // continuation ensures deeper pages still get requested — no history left behind.
        (async () => {
          const lateGained = await waitForBatch(page1PreCount, true, MAX_WAIT_MS - firstPageWaitMs);
          if (lateGained > 0) {
            Logger.info(`[ChatSync] Late page-1 batch landed ${lateGained} messages for ${targetJid} — continuing pagination.`);
            if (lateGained < limit) await paginateRemaining(lateGained);
          } else {
            Logger.info(`[ChatSync] On-demand fetch: no messages arrived from phone for ${targetJid} within the full window.`);
          }
        })().catch((err) => {
          Logger.warn(`[ChatSync] Background late-batch continuation failed for ${targetJid}: ${err instanceof Error ? err.message : String(err)}`);
        });
      }

      Logger.info(`[ChatSync] On-demand fetch (page 1) completed: ${firstGained} new messages for ${targetJid} (waited ≤${firstPageWaitMs}ms)`);
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
