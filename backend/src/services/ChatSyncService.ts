/**
 * [SYNC] CHAT SYNC SERVICE (Refactored Orchestrator)
 *
 * Enterprise-grade historical message synchronization service.
 * Allows on-demand backfill of WhatsApp messages from the phone's history
 * into the CRM database.
 *
 * Phase 2 Refactor: Heavy ingest logic extracted to ChatSyncIngest.
 * This file retains: syncMessages (on-demand bulk sync with progress), status tracking.
 *
 * Features:
 * - Date-based filtering (sync messages from X date)
 * - Batch processing with progress reporting
 * - Duplicate detection
 * - Socket.IO progress events for real-time UI feedback
 * - Multi-tenant isolation (companyId scoped)
 */

import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";
import { TenantContextManager } from "@/config/tenantContext";
import { z } from "zod";
import { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { ChatSyncIngest, HistoryChat, HistoryContact } from "./sync/ChatSyncIngest";
import { syncRepositoryHelper } from "./sync/SyncRepositoryHelper";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";

// ========================
// STRICT TYPE DEFINITIONS
// ========================

/** Zod schema for sync request validation */
export const ChatSyncRequestSchema = z.object({
  companyId: z.string().min(1),
  sessionId: z.string(),
  sinceDate: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .optional(),
  conversationId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(1000).default(500),
  dryRun: z.boolean().default(false),
});

export type ChatSyncRequest = z.infer<typeof ChatSyncRequestSchema>;

export interface ChatSyncProgress {
  status: "started" | "processing" | "completed" | "failed";
  phase: string;
  current: number;
  total: number;
  conversationsProcessed: number;
  messagesFound: number;
  messagesNew: number;
  messagesDuplicate: number;
  errors: number;
  estimatedTimeRemaining?: number;
  currentConversation?: string;
}

export interface ChatSyncResult {
  success: boolean;
  duration: number;
  conversationsProcessed: number;
  messagesFound: number;
  messagesNew: number;
  messagesDuplicate: number;
  errors: string[];
  /** True when the on-demand request was sent to the phone but its batch hadn't landed
   * by response time — messages may still arrive via messaging-history.set, which emits
   * conversation:history_synced so the frontend refetches automatically. */
  pending?: boolean;
}

// ========================
// SERVICE IMPLEMENTATION
// ========================

class ChatSyncService {
  private activeSyncs = new Map<string, boolean>();
  private ingest: ChatSyncIngest;

  constructor() {
    this.ingest = new ChatSyncIngest();
  }

  // ────────────────────────────────────────────────
  // ON-DEMAND BULK SYNC (with progress)
  // ────────────────────────────────────────────────

  async syncMessages(
    request: ChatSyncRequest,
    userId: string,
  ): Promise<ChatSyncResult> {
    const { companyId, sessionId, sinceDate, limit, dryRun, conversationId } =
      request;

    // Lock scope: targeted on-demand syncs lock PER CONVERSATION so a long-running
    // background bulk sync (e.g. right after reconnect) never blocks an agent's manual
    // "sync history" on a specific chat. Two syncs of the same chat are still deduped.
    const lockKey = conversationId ? `${companyId}:${conversationId}` : companyId;

    if (this.activeSyncs.get(lockKey)) {
      return {
        success: false,
        duration: 0,
        conversationsProcessed: 0,
        messagesFound: 0,
        messagesNew: 0,
        messagesDuplicate: 0,
        errors: ["A sync is already running for this conversation"],
      };
    }

    this.activeSyncs.set(lockKey, true);
    const startTime = Date.now();
    const errors: string[] = [];

    let conversationsProcessed = 0;
    let messagesFound = 0;
    let messagesNew = 0;
    let messagesDuplicate = 0;

    try {
      // 1. Emit start progress
      this.emitProgress(companyId, {
        status: "started",
        phase: "Initializing",
        current: 0,
        total: 0,
        conversationsProcessed: 0,
        messagesFound: 0,
        messagesNew: 0,
        messagesDuplicate: 0,
        errors: 0,
      });

      // 2. Get the Baileys store. The live socket (and its full in-memory message
      // store) lives in whatsapp-service, not this process — only contacts/chats/
      // lidToPhone are mirrored to Redis (never `messages`, by design, to keep the
      // blob small), so this is always null here. Fall back to an empty store: the
      // manual/targeted sync path below counts new messages via DB diffing, not via
      // this store, so an empty store doesn't affect correctness — only the
      // "messagesFound" diagnostic stat for the non-targeted (bulk) path, which
      // already isn't reachable from the live on-demand sync route.
      const store = (await this.ingest["getSessionStore"](sessionId)) ?? {
        messages: {},
        chats: new Map(),
        contacts: {},
        lidToPhone: {},
      };

      // [SEARCH] DIAGNOSTIC: Show what's in the store
      const storeJids = Object.keys(store.messages || {});
      const storeMsgCounts = storeJids.map(
        (j) => `${j}(${(store.messages[j] || []).length})`,
      );
      Logger.info(
        `[ChatSync] [SEARCH] STORE DIAG: ${storeJids.length} JIDs in memory: [${storeMsgCounts.join(", ")}]`,
      );
      Logger.info(
        `[ChatSync] [SEARCH] STORE DIAG: LID map entries: ${Object.keys(store.lidToPhone || {}).length}`,
      );
      if (conversationId) {
        Logger.info(
          `[ChatSync] [SEARCH] STORE DIAG: conversationId=${conversationId}`,
        );
      }

      // 3. Extract messages
      let targetJid = conversationId ? WhatsAppIdUtils.getTargetJid(conversationId) : undefined;
      if (targetJid && conversationId) {
        targetJid = await this.ingest.resolveRealJid(companyId, sessionId, targetJid);
      }

      Logger.info(`[ChatSync] [SEARCH] STORE DIAG: targetJid=${targetJid || "ALL"}`);

      // Count DB messages before if doing targeted sync
      const { messageRepository } = await import("@/repositories/MessageRepository");
      let dbCountBefore = 0;
      if (conversationId) {
        const cleanPhone = WhatsAppIdUtils.cleanChannelId(conversationId);
        dbCountBefore = await messageRepository.count({
          where: { companyId, conversation: { channelId: cleanPhone } }
        });
      }

      let allMessages = this.ingest.extractMessagesFromStore(
        store,
        sinceDate,
        targetJid,
      );

      let fetchSuccess = false;

      // If we are syncing a specific conversation, always request more history on-demand from WhatsApp
      // to backfill older messages, not just when memory is empty.
      if (conversationId) {
        Logger.info(`[ChatSync] Manual sync requested for ${conversationId}, fetching on-demand from WhatsApp...`);
        fetchSuccess = await this.ingest.fetchHistoryFromWhatsApp(
          companyId,
          sessionId,
          conversationId,
          limit,
          // Manual sync runs inside an HTTP request (frontend axios aborts at 15s).
          // Bound the synchronous wait; late batches keep arriving in background and
          // reach the UI via conversation:history_synced.
          { firstPageWaitMs: 8000 }
        );
        if (fetchSuccess) {
          allMessages = this.ingest.extractMessagesFromStore(
            store,
            sinceDate,
            targetJid
          );
        }
      }

      // Get the MOST RECENT `limit` messages (slice from the end)
      const limitedMessages = allMessages.slice(-limit);
      messagesFound = limitedMessages.length;

      Logger.info(
        `[ChatSync] [SEARCH] Found ${messagesFound} messages for JID: ${targetJid || "ALL"} (limit: ${limit})`,
      );

      let totalConversations = 0;

      if (conversationId && fetchSuccess) {
        // If targeted sync succeeded, the socket handler messaging-history.set
        // has already bulk-inserted the messages. Count DB differences to find new/duplicates.
        const cleanPhone = WhatsAppIdUtils.cleanChannelId(conversationId);
        const dbCountAfter = await messageRepository.count({
          where: { companyId, conversation: { channelId: cleanPhone } }
        });
        messagesNew = Math.max(0, dbCountAfter - dbCountBefore);
        messagesDuplicate = Math.max(0, messagesFound - messagesNew);
        conversationsProcessed = 1;
        totalConversations = 1;
      } else {
        // 4. Group by conversation
        const grouped = this.groupMessagesByConversation(limitedMessages);
        totalConversations = grouped.size;

        // 5. Resolve fallback sender
        const admin = await syncRepositoryHelper.getAdminUser(companyId);
        const fallbackSenderId = admin?.id;
        if (!fallbackSenderId) throw new Error("No admin user found for fallback sender");

        // 6. Process each conversation
        let convIndex = 0;

        for (const [channelId, msgs] of grouped.entries()) {
          convIndex++;
          conversationsProcessed++;

          // Emit progress
          this.emitProgress(companyId, {
            status: "processing",
            phase: `Processing conversation ${convIndex}/${totalConversations}`,
            current: convIndex,
            total: totalConversations,
            conversationsProcessed,
            messagesFound,
            messagesNew,
            messagesDuplicate,
            errors: errors.length,
            estimatedTimeRemaining: this.estimateTimeRemaining(
              startTime,
              convIndex,
              totalConversations,
            ),
            currentConversation: channelId,
          });

          // Process with TenantContext
          await TenantContextManager.run(
            { companyId, userId, requestId: `sync:${channelId}` },
            async () => {
              for (const msg of msgs) {
                try {
                  const result = await this.ingest.processMessage(
                    companyId,
                    channelId,
                    msg,
                    dryRun,
                    fallbackSenderId,
                  );

                  if (result === "new") messagesNew++;
                  else if (result === "duplicate") messagesDuplicate++;
                } catch (err) {
                  const errMsg = err instanceof Error ? err.message : String(err);
                  errors.push(`[${channelId}] ${msg.key.id}: ${errMsg}`);
                }
              }
            },
          );
        }
      }

      // 7. Emit completion
      const duration = Date.now() - startTime;

      this.emitProgress(companyId, {
        status: "completed",
        phase: "Sync complete",
        current: totalConversations,
        total: totalConversations,
        conversationsProcessed,
        messagesFound,
        messagesNew,
        messagesDuplicate,
        errors: errors.length,
      });

      Logger.info(
        `[ChatSync] [OK] Sync completed for ${companyId} in ${duration}ms | ` +
          `Found: ${messagesFound} | New: ${messagesNew} | Duplicates: ${messagesDuplicate} | Errors: ${errors.length}`,
      );

      return {
        success: true,
        duration,
        conversationsProcessed,
        messagesFound,
        messagesNew,
        messagesDuplicate,
        errors,
        // Manual sync: the phone's batch may land after this response (bounded wait).
        pending: !!conversationId && fetchSuccess && messagesNew === 0,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`[ChatSync] [ERROR] Sync failed for ${companyId}:`, errMsg);

      this.emitProgress(companyId, {
        status: "failed",
        phase: `Error: ${errMsg}`,
        current: 0,
        total: 0,
        conversationsProcessed,
        messagesFound,
        messagesNew,
        messagesDuplicate,
        errors: errors.length + 1,
      });

      return {
        success: false,
        duration: Date.now() - startTime,
        conversationsProcessed,
        messagesFound,
        messagesNew,
        messagesDuplicate,
        errors: [...errors, errMsg],
      };
    } finally {
      this.activeSyncs.delete(lockKey);
    }
  }

  // ────────────────────────────────────────────────
  // DELEGATION: History Sync & Context Sync
  // ────────────────────────────────────────────────

  async handleHistorySync(
    companyId: string,
    messages: WAMessage[],
    chats?: HistoryChat[],
    contacts?: HistoryContact[],
    options?: { onDemand?: boolean },
  ): Promise<void> {
    return this.ingest.handleHistorySync(companyId, messages, chats, contacts, options);
  }

  async contextSync(
    companyId: string,
    conversationId: string,
    channelId: string,
  ): Promise<void> {
    return this.ingest.contextSync(companyId, conversationId, channelId);
  }

  // ────────────────────────────────────────────────
  // STATUS & PROGRESS HELPERS
  // ────────────────────────────────────────────────

  isSyncRunning(companyId: string): boolean {
    return this.activeSyncs.get(companyId) || false;
  }

  getSyncStatus(companyId: string): { running: boolean } {
    return { running: this.isSyncRunning(companyId) };
  }

  private emitProgress(companyId: string, progress: ChatSyncProgress): void {
    gateway.emitToCompany(companyId, "sync.progress", {
      type: "chat_sync",
      ...progress,
      timestamp: new Date().toISOString(),
    });
  }

  private estimateTimeRemaining(
    startTime: number,
    current: number,
    total: number,
  ): number {
    if (current === 0) return 0;
    const elapsed = Date.now() - startTime;
    const avgTimePerItem = elapsed / current;
    const remaining = total - current;
    return Math.round((remaining * avgTimePerItem) / 1000);
  }

  private groupMessagesByConversation(
    messages: WAMessage[],
  ): Map<string, WAMessage[]> {
    const map = new Map<string, WAMessage[]>();

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid) continue;

      const channelId = jid.split("@")[0].split(":")[0];

      if (!map.has(channelId)) {
        map.set(channelId, []);
      }
      map.get(channelId)!.push(msg);
    }

    return map;
  }
}

// Singleton Export
export const chatSyncService = new ChatSyncService();
