import { Logger } from "@/utils/logger";
import { Channel, MessageDirection, Prisma } from "@prisma/client";
import {
  WAMessage,
  BufferJSON,
} from "@whiskeysockets/baileys";
import { messageRepository } from "@/repositories/MessageRepository";
import { reactionRepository } from "@/repositories/ReactionRepository";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { syncMediaService } from "./SyncMediaService";
import { syncMessageParser, ParsedMessage } from "./SyncMessageParser";
import { syncRepositoryHelper } from "./SyncRepositoryHelper";

/**
 * CHAT SYNC BATCH INGESTER
 *
 * Responsible for:
 * - Processing individual WhatsApp messages into CRM records
 * - Batch-ingesting conversation messages with media and sender resolution
 * - Handling message reactions (add/remove)
 */
export class ChatSyncBatchIngester {

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

  async ingestConversationBatch(companyId: string, phone: string, msgs: WAMessage[], adminId: string): Promise<string | null> {
    const isGroup = phone.includes("@g.us");
    const cleanPhone = isGroup ? WhatsAppIdUtils.cleanChannelId(phone) : phone;
    const bestNameMsg = msgs.find(m => !m.key.fromMe && m.pushName);
    const { conversation, customerUserId } = await syncRepositoryHelper.ensureConversation({
      companyId,
      phone: cleanPhone,
      isGroup,
      name: isGroup ? undefined : (bestNameMsg?.pushName || undefined)
    });

    if (!conversation) return null; // Skipped invalid phone (LID guard)

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
        // [MEDIA RETRY] Persist the raw message proto (key + media node with mediaKey/
        // directPath, serialized via BufferJSON) so the on-demand "Reintentar descarga"
        // can rebuild the WAMessage and call downloadMediaMessage + reuploadRequest later,
        // even after this message is no longer in the in-memory store.
        let rawSerialized: string | undefined;
        try {
          rawSerialized = JSON.stringify(
            { key: msg.key, message: msg.message },
            BufferJSON.replacer,
          );
        } catch { /* best-effort */ }
        mediaMeta = {
          mediaType: parsed.mediaType,
          mediaCaption: parsed.mediaCaption,
          mediaFilename: parsed.mediaFilename,
          media: {
            type: `${parsed.mediaType}_unavailable`,
            url: "",
            mimetype,
            name: parsed.mediaFilename || (parsed.mediaType === "audio" ? "Nota de voz" : "Adjunto"),
            size: 0,
            ...(rawSerialized ? { _raw: rawSerialized } : {}),
          }
        };
      }

      // [Baileys 7] Store the sender's WhatsApp display name in metadata so the frontend
      // can show it regardless of the User record state.
      const msgPushName = !msg.key.fromMe && isGroup ? (msg.pushName || bestPushNameByJid.get(
        msg.key.participant ? (WhatsAppIdUtils.getCleanJid(msg.key.participant) || "") : ""
      ) || undefined) : undefined;

      const metadata: Record<string, unknown> = {
        origin: "history_sync",
        ...mediaMeta,
        ...(parsed.contextInfo || {}),
        ...(parsed.isSystem ? { system: true } : {}),
        ...(msgPushName ? { senderName: msgPushName } : {}),
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
                name: resolvedName || (senderPhone ? `+${senderPhone}` : `Participante`),
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

    return conversation.id;
  }

  async handleReaction(companyId: string, react: { key?: { id?: string }, text?: string | null }, senderId: string): Promise<void> {
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
}

export const chatSyncBatchIngester = new ChatSyncBatchIngester();
