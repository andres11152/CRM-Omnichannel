/**
 * 🔄 CHAT SYNC SERVICE
 *
 * Enterprise-grade historical message synchronization service.
 * Allows on-demand backfill of WhatsApp messages from the phone's history
 * into the CRM database.
 *
 * Features:
 * - Date-based filtering (sync messages from X date)
 * - Batch processing with progress reporting
 * - Duplicate detection
 * - Socket.IO progress events for real-time UI feedback
 * - Multi-tenant isolation (companyId scoped)
 *
 * Architecture:
 * - Uses Baileys' store (SimpleStore) for historical data access
 * - Feeds messages through existing MessageHandler for consistent processing
 * - Emits progress events to Socket.IO for frontend tracking
 */

import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";
import { prisma } from "@/config/database";
import { TenantContextManager } from "@/config/tenantContext";
import { MessageDirection, Prisma } from "@prisma/client";
import { z } from "zod";

// ========================
// STRICT TYPE DEFINITIONS
// ========================

/** Zod schema for sync request validation */
export const ChatSyncRequestSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string(),
  sinceDate: z.string().datetime().optional(), // ISO 8601 format
  conversationId: z.string().uuid().optional(), // Sync specific conversation
  limit: z.number().int().positive().max(1000).default(500),
  dryRun: z.boolean().default(false), // If true, only count messages without persisting
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

interface BaileysMessage {
  key: {
    remoteJid: string;
    id: string;
    fromMe: boolean;
    participant?: string;
  };
  messageTimestamp: number | { low: number; high: number; unsigned: boolean }; // Long.Long structure
  pushName?: string;
  message?: Record<string, unknown>;
}

interface SimpleStoreData {
  chats: Map<string, unknown>;
  messages: Record<string, BaileysMessage[]>;
  contacts: Record<string, unknown>;
}

// ========================
// SERVICE IMPLEMENTATION
// ========================

class ChatSyncService {
  private activeSyncs = new Map<string, boolean>(); // Prevent concurrent syncs per company

  /**
   * Synchronize historical messages from WhatsApp to CRM database.
   *
   * @param request - Validated sync request parameters
   * @param userId - ID of user initiating the sync (for audit)
   * @returns ChatSyncResult with statistics
   */
  async syncMessages(
    request: ChatSyncRequest,
    userId: string,
  ): Promise<ChatSyncResult> {
    const { companyId, sessionId, sinceDate, limit, dryRun } = request;
    const startTime = Date.now();
    const errors: string[] = [];

    // 🛡️ PREVENT CONCURRENT SYNCS PER COMPANY
    if (this.activeSyncs.get(companyId)) {
      throw new Error(
        `Sync already in progress for company ${companyId}. Please wait.`,
      );
    }
    this.activeSyncs.set(companyId, true);

    const progress: ChatSyncProgress = {
      status: "started",
      phase: "Initializing",
      current: 0,
      total: 0,
      conversationsProcessed: 0,
      messagesFound: 0,
      messagesNew: 0,
      messagesDuplicate: 0,
      errors: 0,
    };

    try {
      // Emit initial progress
      this.emitProgress(companyId, progress);

      // 1. Validate session exists and get store
      const store = await this.getSessionStore(sessionId);
      if (!store) {
        throw new Error(`Session ${sessionId} not found or has no store.`);
      }

      progress.phase = "Analyzing store";
      this.emitProgress(companyId, progress);

      // 2. Get messages from store
      const allMessages = this.extractMessagesFromStore(store, sinceDate);
      progress.total = Math.min(allMessages.length, limit);
      progress.messagesFound = allMessages.length;

      Logger.info(
        `[ChatSync] Found ${allMessages.length} messages in store for ${companyId}`,
      );

      // 3. Process messages in batches
      const BATCH_SIZE = 50;
      const messagesToProcess = allMessages.slice(0, limit);
      const conversationMap =
        this.groupMessagesByConversation(messagesToProcess);

      progress.phase = "Processing messages";
      progress.status = "processing";
      this.emitProgress(companyId, progress);

      // 4. Process each conversation
      for (const [channelId, messages] of conversationMap.entries()) {
        progress.currentConversation = channelId;
        progress.conversationsProcessed++;

        await TenantContextManager.run(
          { companyId, userId, requestId: `sync:${channelId}` },
          async () => {
            for (let i = 0; i < messages.length; i += BATCH_SIZE) {
              const batch = messages.slice(i, i + BATCH_SIZE);

              for (const msg of batch) {
                try {
                  const result = await this.processMessage(
                    companyId,
                    channelId,
                    msg,
                    dryRun,
                  );

                  if (result === "new") {
                    progress.messagesNew++;
                  } else if (result === "duplicate") {
                    progress.messagesDuplicate++;
                  }
                  progress.current++;
                } catch (err) {
                  progress.errors++;
                  const errorMsg =
                    err instanceof Error ? err.message : String(err);
                  errors.push(`${channelId}/${msg.key.id}: ${errorMsg}`);
                  Logger.warn(`[ChatSync] Error processing message:`, err);
                }
              }

              // Emit progress after each batch
              progress.estimatedTimeRemaining = this.estimateTimeRemaining(
                startTime,
                progress.current,
                progress.total,
              );
              this.emitProgress(companyId, progress);
            }
          },
        );
      }

      // 5. Complete
      progress.status = "completed";
      progress.phase = "Done";
      this.emitProgress(companyId, progress);

      Logger.info(
        `[ChatSync] Completed for ${companyId}: ${progress.messagesNew} new, ${progress.messagesDuplicate} duplicates`,
      );

      return {
        success: true,
        duration: Date.now() - startTime,
        conversationsProcessed: progress.conversationsProcessed,
        messagesFound: progress.messagesFound,
        messagesNew: progress.messagesNew,
        messagesDuplicate: progress.messagesDuplicate,
        errors,
      };
    } catch (err) {
      progress.status = "failed";
      progress.phase = err instanceof Error ? err.message : "Unknown error";
      this.emitProgress(companyId, progress);

      Logger.error(`[ChatSync] Failed for ${companyId}:`, err);

      return {
        success: false,
        duration: Date.now() - startTime,
        conversationsProcessed: progress.conversationsProcessed,
        messagesFound: progress.messagesFound,
        messagesNew: progress.messagesNew,
        messagesDuplicate: progress.messagesDuplicate,
        errors: [...errors, err instanceof Error ? err.message : String(err)],
      };
    } finally {
      this.activeSyncs.delete(companyId);
    }
  }

  /**
   * Get the Baileys store for a session.
   */
  private async getSessionStore(
    sessionId: string,
  ): Promise<SimpleStoreData | null> {
    try {
      // Dynamic import to avoid circular deps
      const { whatsappService } = await import("@/whatsapp");
      const store = whatsappService.getSessionStore(sessionId);
      return store as SimpleStoreData | null;
    } catch (err) {
      Logger.warn(`[ChatSync] Failed to get store for ${sessionId}:`, err);
      return null;
    }
  }

  /**
   * Extract messages from Baileys store with optional date filtering.
   */
  private extractMessagesFromStore(
    store: SimpleStoreData,
    sinceDate?: string,
  ): BaileysMessage[] {
    const allMessages: BaileysMessage[] = [];
    const sinceDateTs = sinceDate ? new Date(sinceDate).getTime() / 1000 : 0;

    for (const jid of Object.keys(store.messages || {})) {
      const chatMessages = store.messages[jid] || [];

      for (const msg of chatMessages) {
        if (!msg.message) continue; // Skip protocol messages

        const msgTimestamp =
          typeof msg.messageTimestamp === "number"
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp);

        if (msgTimestamp >= sinceDateTs) {
          allMessages.push(msg);
        }
      }
    }

    // Sort by timestamp (oldest first for chronological processing)
    allMessages.sort((a, b) => {
      const tsA =
        typeof a.messageTimestamp === "number"
          ? a.messageTimestamp
          : Number(a.messageTimestamp);
      const tsB =
        typeof b.messageTimestamp === "number"
          ? b.messageTimestamp
          : Number(b.messageTimestamp);
      return tsA - tsB;
    });

    return allMessages;
  }

  /**
   * Group messages by conversation (channelId/JID).
   */
  private groupMessagesByConversation(
    messages: BaileysMessage[],
  ): Map<string, BaileysMessage[]> {
    const map = new Map<string, BaileysMessage[]>();

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid) continue;

      // Extract clean channelId (phone number without suffix)
      const channelId = jid.split("@")[0].split(":")[0];

      if (!map.has(channelId)) {
        map.set(channelId, []);
      }
      map.get(channelId)!.push(msg);
    }

    return map;
  }

  /**
   * Process a single message: check duplicate, persist if new.
   */
  private async processMessage(
    companyId: string,
    channelId: string,
    msg: BaileysMessage,
    dryRun: boolean,
  ): Promise<"new" | "duplicate" | "skipped"> {
    const whatsappMessageId = msg.key.id;

    // 1. Check for existing message by WhatsApp ID
    const existing = await prisma.message.findFirst({
      where: { whatsappMessageId },
      select: { id: true },
    });

    if (existing) {
      return "duplicate";
    }

    if (dryRun) {
      return "new"; // In dry-run mode, just count
    }

    // 2. Find or create conversation
    const conversation = await prisma.conversation.findFirst({
      where: { companyId, channelId },
      select: { id: true, participants: { select: { id: true } } },
    });

    if (!conversation) {
      // We could create it, but for historical sync we prefer to skip
      // to avoid creating orphan conversations without proper user linkage
      Logger.debug(
        `[ChatSync] Skipping message for unknown conversation: ${channelId}`,
      );
      return "skipped";
    }

    // 3. Extract content
    const msgContent = msg.message || {};
    let textContent = "";

    if ("conversation" in msgContent) {
      textContent = msgContent.conversation as string;
    } else if ("extendedTextMessage" in msgContent) {
      const ext = msgContent.extendedTextMessage as { text?: string };
      textContent = ext.text || "";
    } else if ("imageMessage" in msgContent) {
      const img = msgContent.imageMessage as { caption?: string };
      textContent = img.caption || "[📷 Imagen]";
    } else if ("videoMessage" in msgContent) {
      const vid = msgContent.videoMessage as { caption?: string };
      textContent = vid.caption || "[🎬 Video]";
    } else if ("audioMessage" in msgContent) {
      textContent = "[🎤 Audio]";
    } else if ("documentMessage" in msgContent) {
      const doc = msgContent.documentMessage as { fileName?: string };
      textContent = doc.fileName || "[📄 Documento]";
    } else if ("stickerMessage" in msgContent) {
      textContent = "[Sticker]";
    } else {
      textContent = "[Mensaje]";
    }

    // 4. Determine direction
    const direction: MessageDirection = msg.key.fromMe
      ? MessageDirection.OUTBOUND
      : MessageDirection.INBOUND;

    // 5. Determine sender
    const senderId = conversation.participants[0]?.id;

    // 6. Create message
    const timestamp =
      typeof msg.messageTimestamp === "number"
        ? msg.messageTimestamp
        : Number(msg.messageTimestamp);

    const metadata: Prisma.InputJsonValue = {
      messageId: whatsappMessageId,
      origin: "history_sync",
      syncedAt: new Date().toISOString(),
    };

    await prisma.message.create({
      data: {
        companyId,
        conversationId: conversation.id,
        whatsappMessageId,
        content: textContent,
        channel: "WHATSAPP", // 🔄 Historical sync from WhatsApp
        direction,
        status: "DELIVERED", // Historical messages are already delivered
        senderId,
        metadata,
        createdAt: new Date(timestamp * 1000),
        updatedAt: new Date(),
      },
    });

    return "new";
  }

  /**
   * Emit sync progress to Socket.IO for real-time UI updates.
   */
  private emitProgress(companyId: string, progress: ChatSyncProgress): void {
    gateway.emitToCompany(companyId, "sync.progress", {
      type: "chat_sync",
      ...progress,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Estimate remaining time based on current progress.
   */
  private estimateTimeRemaining(
    startTime: number,
    current: number,
    total: number,
  ): number {
    if (current === 0) return 0;
    const elapsed = Date.now() - startTime;
    const avgTimePerItem = elapsed / current;
    const remaining = total - current;
    return Math.round((remaining * avgTimePerItem) / 1000); // seconds
  }

  /**
   * Check if a sync is currently running for a company.
   */
  isSyncRunning(companyId: string): boolean {
    return this.activeSyncs.get(companyId) || false;
  }

  /**
   * Get sync status for a company.
   */
  getSyncStatus(companyId: string): { running: boolean } {
    return { running: this.isSyncRunning(companyId) };
  }
}

// Singleton Export
export const chatSyncService = new ChatSyncService();
