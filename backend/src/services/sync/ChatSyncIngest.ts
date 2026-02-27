/**
 * 📥 CHAT SYNC INGEST
 *
 * Handles bulk and JIT message ingestion from WhatsApp history:
 * - handleHistorySync: Massive initial dump on Baileys connection
 * - contextSync: On-demand backfill when agent opens a conversation
 *
 * Shared helpers: processMessage, extractMessagesFromStore, getFallbackSenderId
 */

import { Logger } from "@/utils/logger";
import { gateway } from "@/gateways/socketGateway";
import { MessageDirection, Prisma, Channel } from "@prisma/client";
import { WAMessage } from "@whiskeysockets/baileys";
import { userRepository } from "@/repositories/UserRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { chatService } from "@/services/chatService";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";

/**
 * 🔧 Normalize a Baileys JID to a clean phone number.
 * "573115557696@s.whatsapp.net" → "573115557696"
 * Skips groups (@g.us), broadcast, and LID JIDs (@lid).
 */
function normalizeJidToPhone(jid: string): string | null {
  if (!jid) return null;
  if (
    jid.endsWith("@g.us") ||
    jid.endsWith("@broadcast") ||
    jid.endsWith("@lid")
  )
    return null;
  if (!jid.endsWith("@s.whatsapp.net")) return null;
  const phone = jid.replace("@s.whatsapp.net", "");
  if (!/^\d{7,15}$/.test(phone)) return null;
  return phone;
}

interface SimpleStoreData {
  chats: Map<string, unknown>;
  messages: Record<string, WAMessage[]>;
  contacts: Record<string, unknown>;
  lidToPhone?: Record<string, string>;
}

export class ChatSyncIngest {
  private activeContextSyncs = new Set<string>();

  // ────────────────────────────────────────────────
  // HISTORY SYNC (Bulk Ingest on Connection)
  // ────────────────────────────────────────────────

  async handleHistorySync(
    companyId: string,
    messages: WAMessage[],
  ): Promise<void> {
    if (!messages || messages.length === 0) return;

    setImmediate(async () => {
      try {
        Logger.info(
          `[ChatSync] 📥 Ingesting ${messages.length} historical messages for ${companyId}`,
        );

        const adminUser = await userRepository.findFirst({
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
          const conversation = (await conversationRepository.findFirst({
            where: { companyId, channelId: phone },
            include: { participants: { select: { id: true } } },
          })) as unknown as {
            id: string;
            participants: Array<{ id: string }>;
          } | null;

          if (!conversation) {
            Logger.debug(
              `[ChatSync] ⏩ Skipping ${chatMsgs.length} msgs for unknown phone: ${phone}`,
            );
            totalSkipped += chatMsgs.length;
            continue;
          }

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

            if (!timestamp || isNaN(timestamp)) continue;

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
              const result = await messageRepository.createMany({
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
    });
  }

  // ────────────────────────────────────────────────
  // CONTEXT SYNC (JIT per-conversation backfill)
  // ────────────────────────────────────────────────

  async contextSync(
    companyId: string,
    conversationId: string,
    channelId: string,
  ): Promise<void> {
    const lockKey = `${companyId}:${conversationId}`;

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
      const sessions = (await whatsappService.getSessions(companyId)) || [];
      Logger.debug(
        `[ContextSync] Found ${sessions.length} sessions for company ${companyId}`,
      );
      if (sessions.length > 0)
        Logger.debug(
          `[ContextSync] First session status: ${sessions[0].status}`,
        );
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

      // 3. Get Fallback Sender (Admin)
      const fallbackSenderId = await this.getFallbackSenderId(companyId);

      // 4. Extract messages for this JID only
      const isGroup = channelId.includes("-") || channelId.includes("@g.us");
      const cleanPhone = isGroup ? channelId : channelId.replace(/\D/g, "");
      const targetJid = isGroup
        ? channelId.includes("@g.us")
          ? channelId
          : `${channelId}@g.us`
        : `${cleanPhone}@s.whatsapp.net`;

      Logger.debug(`[ContextSync] Searching store for targetJid: ${targetJid}`);
      Logger.debug(
        `[ContextSync] Total JIDs in store: ${Object.keys(store.messages || {}).length}`,
      );

      const messages = this.extractMessagesFromStore(
        store,
        undefined,
        targetJid,
      );

      const recentMessages = messages.slice(-50);

      Logger.debug(
        `[ContextSync] Found ${recentMessages.length} messages for ${channelId} (total in store for this JID: ${messages.length})`,
      );

      // ── FALLBACK: If store is empty, check if DB already has messages ──
      if (recentMessages.length === 0) {
        Logger.debug(
          `[ContextSync] No messages in store for ${channelId}. Checking DB...`,
        );

        const conversation = await conversationRepository.findFirst({
          where: { companyId, channelId },
          select: { id: true },
        });

        if (conversation) {
          const dbCount = await messageRepository.count({
            where: { companyId, conversationId: conversation.id },
          });

          if (dbCount > 0) {
            Logger.info(
              `[ContextSync] 📦 Store empty but DB has ${dbCount} messages. Emitting refresh for frontend.`,
            );
            gateway.emitToCompany(companyId, "conversation:history_synced", {
              conversationId,
              channelId,
              newMessages: dbCount,
            });
          }
        }
        return;
      }

      Logger.info(
        `[ContextSync] 🚀 Backfilling ${recentMessages.length} messages for ${channelId}`,
      );

      // 5. Process each message (de-duplicate + persist)
      let newCount = 0;
      let dupCount = 0;

      for (const msg of recentMessages) {
        try {
          const result = await this.processMessage(
            companyId,
            cleanPhone,
            msg,
            false,
            fallbackSenderId,
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

      // 6. Emit refresh event so frontend reloads messages
      if (newCount > 0 || dupCount > 0) {
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

  // ────────────────────────────────────────────────
  // SHARED HELPERS
  // ────────────────────────────────────────────────

  async getFallbackSenderId(companyId: string): Promise<string> {
    const admin = await userRepository.findFirst({
      where: { companyId, role: { in: ["ADMIN", "MASTER"] } },
      select: { id: true },
    });
    if (!admin) {
      const anyUser = await userRepository.findFirst({
        where: { companyId },
        select: { id: true },
      });
      if (anyUser) return anyUser.id;
      throw new Error(`No users found for company ${companyId}`);
    }
    return admin.id;
  }

  private async getSessionStore(
    sessionId: string,
  ): Promise<SimpleStoreData | null> {
    try {
      const { whatsappService } = await import("@/whatsapp");
      const store = whatsappService.getSessionStore(sessionId);
      return store as SimpleStoreData | null;
    } catch (err) {
      Logger.warn(`[ChatSync] Failed to get store for ${sessionId}:`, err);
      return null;
    }
  }

  extractMessagesFromStore(
    store: SimpleStoreData,
    sinceDate?: string,
    targetJid?: string,
  ): WAMessage[] {
    const allMessages: WAMessage[] = [];
    const sinceDateTs = sinceDate ? new Date(sinceDate).getTime() / 1000 : 0;

    let jidsToScan: string[] = [];

    if (targetJid) {
      if (store.messages && store.messages[targetJid]) {
        jidsToScan = [targetJid];
      } else {
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
          }
        }
      }
    } else {
      jidsToScan = Object.keys(store.messages || {});
    }

    for (const jid of jidsToScan) {
      const chatMessages = store.messages[jid] || [];

      for (const msg of chatMessages) {
        if (!msg.message) continue;

        const msgTimestamp =
          typeof msg.messageTimestamp === "number"
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp);

        if (msgTimestamp >= sinceDateTs) {
          allMessages.push(msg);
        }
      }
    }

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

  async processMessage(
    companyId: string,
    channelId: string,
    msg: WAMessage,
    dryRun: boolean,
    fallbackSenderId: string,
  ): Promise<"new" | "duplicate" | "skipped"> {
    const whatsappMessageId = msg.key.id;

    const existing = await messageRepository.findFirst({
      where: { whatsappMessageId },
      select: { id: true },
    });

    if (existing) {
      return "duplicate";
    }

    if (dryRun) {
      return "new";
    }

    let conversation = (await conversationRepository.findFirst({
      where: { companyId, channelId },
      include: { participants: { select: { id: true } } },
    })) as unknown as {
      id: string;
      subject: string | null;
      participants: Array<{ id: string }>;
    } | null;

    let customerUserId = conversation?.participants?.[0]?.id;

    if (!conversation) {
      Logger.debug(
        `[ChatSync] Auto-creating missing conversation: ${channelId}`,
      );
      try {
        const isGroup = WhatsAppIdUtils.isGroup(channelId);
        const destPhone = WhatsAppIdUtils.getPhoneNumber(channelId);

        let createdUserId: string | undefined;
        let conversationSubject = channelId;

        // Auto-create User Participant for 1-to-1s
        if (!isGroup) {
          const newUser = await chatService.upsertWhatsAppUser({
            email: `${channelId.split("@")[0]}@whatsapp.user`,
            name:
              msg.pushName ||
              (destPhone ? `+${destPhone}` : channelId.split("@")[0]),
            companyId,
            phone: destPhone,
            role: "USER",
          });
          createdUserId = newUser.id;
          customerUserId = createdUserId;
          conversationSubject = newUser.name || channelId;
        } else {
          conversationSubject = `📢 Grupo Histórico`;
        }

        const newConv = await chatService.createConversation({
          companyId,
          channelId,
          subject: conversationSubject,
          userId: createdUserId,
          isGroup,
        });

        conversation = {
          id: newConv.id,
          subject: newConv.subject,
          participants: createdUserId ? [{ id: createdUserId }] : [],
        };
      } catch (err) {
        Logger.error(
          `[ChatSync] ❌ Failed to create conversation for ${channelId}`,
          err,
        );
        return "skipped";
      }
    }

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

    const isFromMe = msg.key.fromMe === true;
    const direction: MessageDirection = isFromMe
      ? MessageDirection.OUTBOUND
      : MessageDirection.INBOUND;

    const dbSenderId = isFromMe
      ? fallbackSenderId
      : customerUserId || fallbackSenderId;

    const timestamp =
      typeof msg.messageTimestamp === "number"
        ? msg.messageTimestamp
        : Number(msg.messageTimestamp);

    const metadata: Prisma.InputJsonValue = {
      messageId: whatsappMessageId,
      origin: "history_sync",
      syncedAt: new Date().toISOString(),
    };

    await messageRepository.create({
      data: {
        companyId,
        conversationId: conversation.id,
        whatsappMessageId,
        content: textContent,
        channel: "WHATSAPP",
        direction,
        status: "DELIVERED",
        senderId: dbSenderId,
        metadata,
        createdAt: new Date(timestamp * 1000),
        updatedAt: new Date(),
      },
    });

    // 🛡️ 100-YEAR FIX: Ensure a Ticket exists for this synced conversation
    // This solves "NO CREA LOS TICKETS EN COLA" after backfilling
    try {
      if (customerUserId) {
        await chatService.ensureTicket(
          companyId,
          conversation.id,
          customerUserId,
          conversation.subject || channelId,
          textContent || "Sync",
        );
      }
    } catch (ticketErr) {
      Logger.error(
        `[ChatSync] Failed to ensure ticket for ${channelId}`,
        ticketErr,
      );
    }

    return "new";
  }
}
