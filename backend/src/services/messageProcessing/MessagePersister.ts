import { Channel, MessageDirection, Prisma, UserRole } from "@prisma/client";
import { messageRepository } from "@/repositories/MessageRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { userRepository } from "@/repositories/UserRepository";
import { Logger } from "@/utils/logger";
import type {
  MessageWithSender,
  MessagingMediaPayload,
} from "@/types/message.types";

export interface MessagePersistParams {
  companyId: string;
  conversationId: string;
  text: string;
  isOutbound: boolean;
  senderId: string;
  hasMedia?: boolean;
  media?: MessagingMediaPayload;
  contactId?: string;
  messageId?: string;
  /** Which channel this message belongs to. Defaults to WHATSAPP for backward compatibility. */
  channel?: Channel;
}

/**
 * [SAVE] MESSAGE PERSISTER
 *
 * Single Responsibility: Deduplicates and persists messages.
 * Also updates conversation/contact timestamps.
 */
export class MessagePersister {
  /**
   * Persists a message after deduplication check.
   * Returns null if the message is a duplicate.
   */
  async persist(
    params: MessagePersistParams,
  ): Promise<MessageWithSender | null> {
    const {
      companyId,
      conversationId,
      text,
      isOutbound,
      senderId,
      hasMedia,
      media,
      contactId,
      channel = Channel.WHATSAPP,
    } = params;

    // 1. DEDUPLICATION (Exact ID match or 5s window for text)
    const isDuplicate = await this.checkDuplicate(companyId, conversationId, text, params.messageId, hasMedia, channel);
    if (isDuplicate) {
      Logger.debug(
        `[MessagePersister] [SKIP] Duplicate message skipped: "${text?.substring(0, 50)}"`,
      );
      return null;
    }

    // 2. RESOLVE SENDER (outbound -> admin, inbound -> user)
    let effectiveSenderId = senderId;
    if (isOutbound) {
      effectiveSenderId = await this.resolveOutboundSender(companyId, senderId);
    }

    // 3. PERSIST MESSAGE
    const newMessage = await messageRepository.create({
      data: {
        companyId,
        conversationId,
        channel,
        direction: isOutbound
          ? MessageDirection.OUTBOUND
          : MessageDirection.INBOUND,
        content: text,
        senderId: effectiveSenderId,
        whatsappMessageId: channel === Channel.WHATSAPP ? params.messageId || undefined : undefined,
        instagramMessageId: channel === Channel.INSTAGRAM_DM ? params.messageId || undefined : undefined,
        metadata: hasMedia
          ? { media: media as unknown as Prisma.InputJsonObject }
          : Prisma.JsonNull,
      },
      include: { sender: true },
    });

    // 4. TOUCH TIMESTAMPS (non-blocking)
    await this.touchTimestamps(companyId, conversationId, contactId);

    return newMessage as MessageWithSender;
  }

  // ─── Private Helpers ───────────────────────────────────────────

  private async checkDuplicate(
    companyId: string,
    conversationId: string,
    text: string,
    messageId?: string,
    hasMedia?: boolean,
    channel: Channel = Channel.WHATSAPP,
  ): Promise<boolean> {
    if (messageId) {
       const existing =
         channel === Channel.INSTAGRAM_DM
           ? await messageRepository.findUnique({
               where: { companyId_instagramMessageId: { companyId, instagramMessageId: messageId } },
             })
           : await messageRepository.findUnique({
               where: { companyId_whatsappMessageId: { companyId, whatsappMessageId: messageId } },
             });
       if (existing) return true;
    }

    if (hasMedia) return false;

    const recent = await messageRepository.findFirst({
      where: {
        conversationId,
        content: text,
        createdAt: { gt: new Date(Date.now() - 5000) }, // 5s window
      },
    });
    return !!recent;
  }

  private async resolveOutboundSender(
    companyId: string,
    fallbackId: string,
  ): Promise<string> {
    const admin = await userRepository.findFirst({
      where: {
        companyId,
        role: { in: [UserRole.ADMIN, UserRole.MASTER] },
      },
    });
    return admin?.id || fallbackId;
  }

  private async touchTimestamps(
    companyId: string,
    conversationId: string,
    contactId?: string,
  ): Promise<void> {
    await conversationRepository.update(companyId, conversationId, {
      updatedAt: new Date(),
    });

    if (contactId) {
      await contactRepository
        .update(companyId, contactId, { updatedAt: new Date() })
        .catch((e) =>
          Logger.warn("Contact timestamp update failed", { error: e }),
        );
    }
  }
}

export const messagePersister = new MessagePersister();
