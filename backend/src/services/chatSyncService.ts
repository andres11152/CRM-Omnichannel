/**
 * 🔄 CHAT SYNC SERVICE (Refactored Orchestrator)
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
  companyId: z.string().uuid(),
  sessionId: z.string(),
  sinceDate: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .optional(),
  conversationId: z.string().uuid().optional(),
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

    // 🛡️ Type definition for Baileys socket with server fetch capability
    interface WASocketWithFetch extends WASocket {
      fetchMessagesFromWAServer?: (jid: string, count: number) => Promise<WAMessage[]>;
    }

    if (this.activeSyncs.get(companyId)) {
      return {
        success: false,
        duration: 0,
        conversationsProcessed: 0,
        messagesFound: 0,
        messagesNew: 0,
        messagesDuplicate: 0,
        errors: ["A sync is already running for this company"],
      };
    }

    this.activeSyncs.set(companyId, true);
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

      // 2. Get the Baileys store
      const store = await this.ingest["getSessionStore"](sessionId);
      if (!store) {
        throw new Error(`No store found for session ${sessionId}`);
      }

      // 🔍 DIAGNOSTIC: Show what's in the store
      const storeJids = Object.keys(store.messages || {});
      const storeMsgCounts = storeJids.map(
        (j) => `${j}(${(store.messages[j] || []).length})`,
      );
      Logger.info(
        `[ChatSync] 🔍 STORE DIAG: ${storeJids.length} JIDs in memory: [${storeMsgCounts.join(", ")}]`,
      );
      Logger.info(
        `[ChatSync] 🔍 STORE DIAG: LID map entries: ${Object.keys(store.lidToPhone || {}).length}`,
      );
      if (conversationId) {
        Logger.info(
          `[ChatSync] 🔍 STORE DIAG: conversationId=${conversationId}`,
        );
      }

      // 3. Extract messages
      let targetJid: string | undefined = undefined;
      if (conversationId) {
        if (WhatsAppIdUtils.isGroup(conversationId)) {
          targetJid = conversationId; // It's already a group JID (@g.us)
        } else if (conversationId.includes("@s.whatsapp.net")) {
          targetJid = conversationId; // It's a full user JID
        } else {
          // It's a raw number or channelId. Treat as phone if no @g.us suffix.
          const clean = conversationId.replace(/\D/g, "");
          targetJid = `${clean}@s.whatsapp.net`;
        }
      }

      Logger.info(`[ChatSync] 🔍 STORE DIAG: targetJid=${targetJid || "ALL"}`);

      let allMessages = this.ingest.extractMessagesFromStore(
        store,
        sinceDate,
        targetJid,
      );

      // ── ENHANCEMENT: If targeted sync and store is empty, fetch from server ──
      if (allMessages.length === 0 && targetJid) {
        const { whatsappService } = await import("@/whatsapp");
        const sock = whatsappService.getSocket(sessionId) as WASocketWithFetch;
        if (sock && typeof sock.fetchMessagesFromWAServer === "function") {
          try {
            Logger.info(`[ChatSync] 🌐 Store empty for ${targetJid}. Fetching from server...`);
            const fetched: WAMessage[] = await sock.fetchMessagesFromWAServer(targetJid, limit);
            if (fetched && fetched.length > 0) {
              Logger.info(`[ChatSync] ✅ Fetched ${fetched.length} messages from server for ${targetJid}`);
              const { syncMessageParser } = await import("./sync/SyncMessageParser");
              allMessages = fetched.sort((a, b) => {
                return syncMessageParser.getTimestamp(a.messageTimestamp) - syncMessageParser.getTimestamp(b.messageTimestamp);
              });
            }
          } catch (fetchErr) {
            Logger.warn(`[ChatSync] Failed to fetch from server for ${targetJid}:`, fetchErr);
          }
        }
      }

      // Get the MOST RECENT `limit` messages (slice from the end)
      const limitedMessages = allMessages.slice(-limit);
      messagesFound = limitedMessages.length;

      Logger.info(
        `[ChatSync] 🔍 Found ${messagesFound} messages (limit: ${limit})`,
      );

      // 4. Group by conversation
      const grouped = this.groupMessagesByConversation(limitedMessages);
      const totalConversations = grouped.size;

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
        `[ChatSync] ✅ Sync completed for ${companyId} in ${duration}ms | ` +
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
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`[ChatSync] ❌ Sync failed for ${companyId}:`, errMsg);

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
      this.activeSyncs.set(companyId, false);
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
  ): Promise<void> {
    return this.ingest.handleHistorySync(companyId, messages, chats, contacts);
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
