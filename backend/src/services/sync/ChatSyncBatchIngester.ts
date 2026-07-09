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

    if (parsed.type === "edit") {
      const editFallbackSenderId = parsed.direction === MessageDirection.OUTBOUND ? fallbackSenderId : (customerUserId || fallbackSenderId);
      await this.applyHistoricalEdit(companyId, conversation.id, parsed, editFallbackSenderId);
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

      // [MEDIA RETRY] When the inline download fails, persist the raw proto (same as
      // ingestConversationBatch) so the on-demand retry / background hydration can
      // rebuild the WAMessage later. Without _raw, retry died with "mensaje muy
      // antiguo" as soon as the message left the in-memory store (cap 150).
      let rawSerialized: string | undefined;
      if (!url) {
        try {
          rawSerialized = JSON.stringify({ key: msg.key, message: msg.message }, BufferJSON.replacer);
        } catch { /* best-effort */ }
      }

      mediaMeta = {
        mediaType: parsed.mediaType,
        mediaCaption: parsed.mediaCaption,
        mediaFilename: parsed.mediaFilename,
        media: {
          type: url ? parsed.mediaType : `${parsed.mediaType}_unavailable`,
          url: url || "",
          mimetype,
          name: parsed.mediaFilename || (parsed.mediaType === "audio" ? "Nota de voz" : "Adjunto"),
          size: 0,
          ...(rawSerialized ? { _raw: rawSerialized } : {}),
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
      // [FIX] Bulk history sync never validated messages the way processMessage()
      // does — a missing key.id (or bogus timestamp) would slip into validBatch
      // and poison the single createMany() call for the WHOLE chat's batch below.
      if (!syncMessageParser.isValid(msg)) continue;

      const parsed: ParsedMessage | null = syncMessageParser.parseContent(msg);
      if (!parsed) continue;

      // [FIX] Baileys delivers an edited message in historical sync as ONLY the
      // protocolMessage/MESSAGE_EDIT frame — there is no separate "original text"
      // entry to fall back on (Baileys only synthesizes messages.update for LIVE
      // edits, per process-message.js). The old code did `continue` here, which
      // silently dropped the message forever instead of updating/creating it.
      if (parsed.type === "edit") {
        const fallbackSenderId = parsed.direction === MessageDirection.OUTBOUND ? adminId : (customerUserId || adminId);
        await this.applyHistoricalEdit(companyId, conversation.id, parsed, fallbackSenderId);
        continue;
      }

      if (parsed.type !== "message") continue;

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
      // [FIX] createMany() is a single atomic INSERT — one malformed row (a
      // constraint violation unrelated to duplicates, which skipDuplicates
      // doesn't protect against) rejects the WHOLE statement, silently losing
      // every message in this chat's batch (observed as a multi-message gap).
      // Fall back to inserting one-by-one so a single bad row can't sink the rest.
      try {
        await messageRepository.createMany({ data: validBatch, skipDuplicates: true });
      } catch (err) {
        Logger.warn(
          `[ChatSync] Bulk createMany failed for ${validBatch.length} messages (conversation ${conversation.id}), falling back to per-message insert:`,
          err instanceof Error ? err.message : err,
        );
        for (const row of validBatch) {
          try {
            await messageRepository.create({ data: row });
          } catch (rowErr) {
            Logger.error(
              `[ChatSync] Failed to insert individual message ${row.whatsappMessageId} during batch fallback:`,
              rowErr instanceof Error ? rowErr.message : rowErr,
            );
          }
        }
      }
    }

    return conversation.id;
  }

  /**
   * [FIX] Applies an edit discovered during BULK history sync. Mirrors
   * processMessage()'s single-message edit path: update the original if it's
   * already in the DB, or — since historical sync never delivers a separate
   * "pre-edit" entry for this message — create it directly with the edited
   * content so it isn't silently lost.
   */
  private async applyHistoricalEdit(
    companyId: string,
    conversationId: string,
    parsed: ParsedMessage,
    fallbackSenderId: string,
  ): Promise<void> {
    const editContent = parsed.content as { originalMessageId?: string } | undefined;
    const originalMessageId = editContent?.originalMessageId;
    const editedMessageProto = parsed.msgContent;
    if (!originalMessageId || !editedMessageProto) return;

    const fakeMsg: WAMessage = {
      key: { id: originalMessageId, fromMe: parsed.direction === MessageDirection.OUTBOUND },
      message: editedMessageProto as import("@whiskeysockets/baileys").proto.IMessage,
      messageTimestamp: Math.floor(Date.now() / 1000),
    };
    const parsedEdit = syncMessageParser.parseContent(fakeMsg);
    if (!parsedEdit?.textContent) return;

    const originalMsg = await messageRepository.findMessageByWhatsAppId(originalMessageId, companyId);
    if (originalMsg) {
      const existingMeta = (originalMsg.metadata as Record<string, unknown>) || {};
      await messageRepository.update(
        originalMsg.id,
        {
          content: parsedEdit.textContent,
          metadata: { ...existingMeta, isEdited: true, editedAt: new Date().toISOString() },
        },
        companyId,
      );
      Logger.info(`[ChatSync] [EDIT] Updated message ${originalMessageId} content during bulk history sync`);
      return;
    }

    // Original was never synced (this IS the only historical entry for it) — create
    // it now with the final edited content rather than losing the message entirely.
    try {
      await messageRepository.create({
        data: {
          companyId,
          conversationId,
          whatsappMessageId: originalMessageId,
          content: parsedEdit.textContent,
          channel: Channel.WHATSAPP,
          direction: parsed.direction,
          senderId: fallbackSenderId,
          status: "DELIVERED",
          metadata: {
            origin: "history_sync",
            isEdited: true,
            editedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          createdAt: new Date(),
        },
      });
      Logger.info(`[ChatSync] [EDIT] Created message ${originalMessageId} from edit frame during bulk history sync (original was never synced)`);
    } catch (err) {
      Logger.error(`[ChatSync] Failed to create message from historical edit ${originalMessageId}:`, err instanceof Error ? err.message : err);
    }
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
