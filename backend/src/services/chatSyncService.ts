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
import { MessageDirection, Prisma, Channel } from "@prisma/client";
import { z } from "zod";
import { WAMessage } from "@whiskeysockets/baileys";

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

// Baileys types are imported from the library now.

/**
 * 🔧 Normalize a Baileys JID to a clean phone number.
 * "573115557696@s.whatsapp.net" → "573115557696"
 * Skips groups (@g.us), broadcast, and LID JIDs (@lid).
 */
function normalizeJidToPhone(jid: string): string | null {
  if (!jid) return null;
  // ❌ Skip groups, broadcast, and LID JIDs
  if (
    jid.endsWith("@g.us") ||
    jid.endsWith("@broadcast") ||
    jid.endsWith("@lid")
  )
    return null;
  // Only accept @s.whatsapp.net JIDs (real phone numbers)
  if (!jid.endsWith("@s.whatsapp.net")) return null;
  // Strip suffix
  const phone = jid.replace("@s.whatsapp.net", "");
  // Validate: must be digits only and 7-15 chars (international phone)
  if (!/^\d{7,15}$/.test(phone)) return null;
  return phone;
}

interface SimpleStoreData {
  chats: Map<string, unknown>;
  messages: Record<string, WAMessage[]>;
  contacts: Record<string, unknown>;
  lidToPhone?: Record<string, string>;
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
      // 🎯 TARGETED SYNC: If conversationId is provided (as a phone), resolve its JID and filter only that chat.
      let targetJid: string | undefined;
      if (request.conversationId) {
        // This field holds the PHONE (e.g. "57300...") in this context
        const phone = request.conversationId.replace(/\D/g, "");
        // Try common suffixes for simple matching
        targetJid = `${phone}@s.whatsapp.net`;
      }

      const allMessages = this.extractMessagesFromStore(
        store,
        sinceDate,
        targetJid, // Pass the target filter down
      );

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
   * Extract messages from Baileys store with optional date and JID filtering.
   */
  private extractMessagesFromStore(
    store: SimpleStoreData,
    sinceDate?: string,
    targetJid?: string,
  ): WAMessage[] {
    const allMessages: WAMessage[] = [];
    const sinceDateTs = sinceDate ? new Date(sinceDate).getTime() / 1000 : 0;

    // 🎯 OPTIMIZATION: If targetJid is provided, resolve correct key (Phone vs LID)
    let jidsToScan: string[] = [];

    if (targetJid) {
      if (store.messages && store.messages[targetJid]) {
        // Direct hit (Phone JID)
        jidsToScan = [targetJid];
        Logger.debug(`[ChatSync] 🎯 Direct hit for JID: ${targetJid}`);
      } else {
        // Try to find LID mapping for this Phone JID
        // lidToPhone maps LID_BASE -> Phone_JID
        const lidMap = store.lidToPhone || {};
        const foundLidBase = Object.keys(lidMap).find(
          (lidBase) => lidMap[lidBase] === targetJid,
        );

        if (foundLidBase) {
          const lidJid = `${foundLidBase}@lid`;
          if (store.messages && store.messages[lidJid]) {
            jidsToScan = [lidJid];
            Logger.debug(
              `[ChatSync] 🔄 Resolved ${targetJid} to LID ${lidJid} (found messages)`,
            );
          } else {
            Logger.warn(
              `[ChatSync] Found LID ${lidJid} for ${targetJid} but no messages in store.`,
            );
            // Fallback: Check without suffix? No, keys always have suffix.
          }
        } else {
          // Debug only if truly missing
          if (!store.messages || Object.keys(store.messages).length === 0) {
            Logger.warn(
              `[ChatSync] Store is empty. Persisted store might not be loaded yet.`,
            );
          } else {
            Logger.warn(
              `[ChatSync] ⚠️ Target JID ${targetJid} not found in keys (Phone or LID). Keys: ${Object.keys(store.messages).length}`,
            );
          }
        }
      }
    } else {
      jidsToScan = Object.keys(store.messages || {});
    }

    for (const jid of jidsToScan) {
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
    messages: WAMessage[],
  ): Map<string, WAMessage[]> {
    const map = new Map<string, WAMessage[]>();

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
    msg: WAMessage,
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

  /**
   * 📥 Enterprise History Ingest: Dump to DB (Async)
   *
   * Captures the massive history dump from Baileys on initial connection
   * and persists it directly to the database.
   *
   * 🔧 FIXES APPLIED:
   * - JID Normalization: "573115557696@s.whatsapp.net" → "573115557696"
   * - senderId Resolution: Falls back to admin user (required field)
   * - Channel Enum: Uses Channel.WHATSAPP instead of string literal
   */
  async handleHistorySync(
    companyId: string,
    messages: WAMessage[],
  ): Promise<void> {
    if (!messages || messages.length === 0) return;

    // Run in background / non-blocking
    setImmediate(async () => {
      try {
        Logger.info(
          `[ChatSync] 📥 Ingesting ${messages.length} historical messages for ${companyId}`,
        );

        // 🔑 Pre-resolve: Find a fallback senderId (admin user) — REQUIRED field
        const adminUser = await prisma.user.findFirst({
          where: { companyId, role: { in: ["ADMIN", "MASTER"] } },
          select: { id: true },
        });

        if (!adminUser) {
          Logger.error(
            `[ChatSync] ❌ No admin user found for ${companyId}. Cannot ingest history (senderId required).`,
          );
          return;
        }

        const fallbackSenderId = adminUser.id;

        // 1. Group by NORMALIZED phone (not raw JID)
        const msgsByPhone = new Map<string, WAMessage[]>();
        let skippedJids = 0;

        for (const msg of messages) {
          const rawJid = msg.key.remoteJid;
          if (!rawJid) {
            skippedJids++;
            continue;
          }

          const phone = normalizeJidToPhone(rawJid);
          if (!phone) {
            skippedJids++;
            continue;
          }

          if (!msgsByPhone.has(phone)) {
            msgsByPhone.set(phone, []);
          }
          msgsByPhone.get(phone)!.push(msg);
        }

        Logger.info(
          `[ChatSync] 📊 Grouped into ${msgsByPhone.size} conversations (skipped ${skippedJids} invalid JIDs)`,
        );

        let totalInserted = 0;
        let totalSkipped = 0;

        for (const [phone, chatMsgs] of msgsByPhone.entries()) {
          // 2. Find conversation by NORMALIZED phone (matches DB format)
          const conversation = await prisma.conversation.findFirst({
            where: { companyId, channelId: phone },
            select: { id: true, participants: { select: { id: true } } },
          });

          if (!conversation) {
            // Only sync messages for EXISTING conversations
            // (New conversations will be created when the contact sends a new message)
            Logger.debug(
              `[ChatSync] ⏩ Skipping ${chatMsgs.length} msgs for unknown phone: ${phone}`,
            );
            totalSkipped += chatMsgs.length;
            continue;
          }

          // Resolve senderIds: different for INBOUND vs OUTBOUND
          // OUTBOUND (fromMe) → admin/agent sent it
          // INBOUND (!fromMe) → the contact's WhatsApp user sent it
          const contactUserId =
            conversation.participants[0]?.id || fallbackSenderId;

          // 3. Prepare Bulk Data
          const validMsgs: Prisma.MessageCreateManyInput[] = [];
          let outCount = 0;
          let inCount = 0;

          for (const msg of chatMsgs) {
            const msgContent = msg.message || {};
            let textContent = "";

            if ("conversation" in msgContent)
              textContent = (msgContent.conversation as string) || "";
            else if ("extendedTextMessage" in msgContent)
              textContent =
                (msgContent.extendedTextMessage as { text?: string }).text ||
                "";
            else if ("imageMessage" in msgContent) textContent = "[Imagen]";
            else if ("videoMessage" in msgContent) textContent = "[Video]";
            else if ("audioMessage" in msgContent) textContent = "[Audio]";
            else if ("documentMessage" in msgContent)
              textContent = "[Documento]";
            else if ("stickerMessage" in msgContent) textContent = "[Sticker]";
            else if ("contactMessage" in msgContent) textContent = "[Contacto]";
            else if ("locationMessage" in msgContent)
              textContent = "[Ubicación]";
            else textContent = "[Media]";

            const whatsappMessageId = msg.key.id;
            if (!whatsappMessageId) continue;

            const timestamp =
              typeof msg.messageTimestamp === "number"
                ? msg.messageTimestamp
                : Number(msg.messageTimestamp);

            // Skip invalid timestamps
            if (!timestamp || isNaN(timestamp)) continue;

            // 🎯 CRITICAL FIX: Correctly determine direction & sender
            const isFromMe = msg.key.fromMe === true;
            const direction = isFromMe
              ? MessageDirection.OUTBOUND
              : MessageDirection.INBOUND;
            const senderId = isFromMe ? fallbackSenderId : contactUserId;

            if (isFromMe) outCount++;
            else inCount++;

            validMsgs.push({
              companyId,
              conversationId: conversation.id,
              whatsappMessageId,
              content: textContent,
              channel: Channel.WHATSAPP,
              direction,
              status: "DELIVERED",
              senderId,
              metadata: {
                origin: "history_sync",
                syncedAt: new Date().toISOString(),
              },
              createdAt: new Date(timestamp * 1000),
              updatedAt: new Date(),
            });
          }

          // 4. Bulk Insert (chunked)
          if (validMsgs.length > 0) {
            const CHUNK_SIZE = 100;
            for (let i = 0; i < validMsgs.length; i += CHUNK_SIZE) {
              const chunk = validMsgs.slice(i, i + CHUNK_SIZE);
              const result = await prisma.message.createMany({
                data: chunk,
                skipDuplicates: true,
              });
              totalInserted += result.count;
            }

            Logger.info(
              `[ChatSync] ✅ ${phone}: ${validMsgs.length} prepared (IN:${inCount} OUT:${outCount}), inserted to DB`,
            );
          }
        }

        Logger.info(
          `[ChatSync] 🏁 History Ingest Complete for ${companyId} | Inserted: ${totalInserted} | Skipped (no conversation): ${totalSkipped}`,
        );
      } catch (err) {
        Logger.error(`[ChatSync] ❌ Failed to ingest history:`, err);
      }
    }); // End setImmediate
  }

  // ========================
  // 🚀 CONTEXT SYNC (JIT)
  // ========================

  private activeContextSyncs = new Set<string>(); // Per-conversation lock

  /**
   * 🚀 Context Sync: Just-In-Time historical message backfill.
   *
   * Triggered automatically when an agent opens a conversation with few local messages.
   * Fetches the last 50 messages from the Baileys in-memory store for that specific JID,
   * de-duplicates, and persists them with original timestamps.
   *
   * Key properties:
   * - Non-blocking: runs async, doesn't delay the API response
   * - Idempotent: skips if already syncing this conversation
   * - Targeted: only scans the specific JID, no full store scan
   * - Safe: marks messages as `isHistorical: true` to avoid false notifications
   *
   * @param companyId - Tenant scope
   * @param conversationId - CRM Conversation ID
   * @param channelId - Phone number (channelId) used as JID lookup key
   */
  async contextSync(
    companyId: string,
    conversationId: string,
    channelId: string,
  ): Promise<void> {
    const lockKey = `${companyId}:${conversationId}`;

    // 🛡️ Prevent duplicate syncs for same conversation
    if (this.activeContextSyncs.has(lockKey)) {
      Logger.debug(
        `[ContextSync] Already syncing ${channelId}, skipping duplicate`,
      );
      return;
    }

    this.activeContextSyncs.add(lockKey);
    const startTime = Date.now();

    try {
      // 1. Find an active session for this company
      const { whatsappService } = await import("@/whatsapp");
      const sessions = await whatsappService.getSessions(companyId);
      const activeSession = sessions.find((s) => s.status === "CONNECTED");

      if (!activeSession) {
        Logger.debug("[ContextSync] No active session, skipping");
        return;
      }

      // 2. Get store
      const store = await this.getSessionStore(activeSession.sessionId);
      if (!store) {
        Logger.debug("[ContextSync] No store available, skipping");
        return;
      }

      // 3. Extract messages for this JID only (no date limit, just take what's in store)
      const cleanPhone = channelId.replace(/\D/g, "");
      const targetJid = `${cleanPhone}@s.whatsapp.net`;

      const messages = this.extractMessagesFromStore(
        store,
        undefined, // 🟢 FIX: No date limit. Get all available messages in store.
        targetJid,
      );

      // Take only the LAST 50 (most recent)
      const recentMessages = messages.slice(-50);

      if (recentMessages.length === 0) {
        Logger.debug(`[ContextSync] No messages in store for ${channelId}`);
        return;
      }

      Logger.info(
        `[ContextSync] 🚀 Backfilling ${recentMessages.length} messages for ${channelId}`,
      );

      // 4. Process each message (de-duplicate + persist)
      let newCount = 0;
      let dupCount = 0;

      for (const msg of recentMessages) {
        try {
          const result = await this.processMessage(
            companyId,
            cleanPhone,
            msg,
            false, // Not dry run
          );

          if (result === "new") newCount++;
          else if (result === "duplicate") dupCount++;
        } catch (err) {
          Logger.warn(`[ContextSync] Error processing ${msg.key.id}:`, err);
        }
      }

      const duration = Date.now() - startTime;
      Logger.info(
        `[ContextSync] ✅ Done for ${channelId}: ${newCount} new, ${dupCount} duplicates (${duration}ms)`,
      );

      // 5. Emit refresh event so frontend reloads messages
      if (newCount > 0) {
        gateway.emitToCompany(companyId, "conversation:history_synced", {
          conversationId,
          channelId,
          newMessages: newCount,
        });
      }
    } catch (err) {
      Logger.error(`[ContextSync] Failed for ${channelId}:`, err);
    } finally {
      this.activeContextSyncs.delete(lockKey);
    }
  }
}

// Singleton Export
export const chatSyncService = new ChatSyncService();
