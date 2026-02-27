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
}

/**
 * 💾 MESSAGE PERSISTER
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
    } = params;

    // 1. DEDUPLICATION (5s window)
    const isDuplicate = await this.checkDuplicate(conversationId, text);
    if (isDuplicate) {
      Logger.debug(
        `[MessagePersister] ⏩ Duplicate message skipped: "${text?.substring(0, 50)}"`,
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
        channel: Channel.WHATSAPP,
        direction: isOutbound
          ? MessageDirection.OUTBOUND
          : MessageDirection.INBOUND,
        content: text,
        senderId: effectiveSenderId,
        metadata: hasMedia
          ? { media: media as unknown as Prisma.InputJsonObject }
          : Prisma.JsonNull,
      },
      include: { sender: true },
    });

    // 4. TOUCH TIMESTAMPS (non-blocking)
    await this.touchTimestamps(conversationId, contactId);

    return newMessage as MessageWithSender;
  }

  // ─── Private Helpers ───────────────────────────────────────────

  private async checkDuplicate(
    conversationId: string,
    text: string,
  ): Promise<boolean> {
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
    conversationId: string,
    contactId?: string,
  ): Promise<void> {
    await conversationRepository.update(conversationId, {
      updatedAt: new Date(),
    });

    if (contactId) {
      await contactRepository
        .update(contactId, { updatedAt: new Date() })
        .catch((e) =>
          Logger.warn("Contact timestamp update failed", { error: e }),
        );
    }
  }
}

export const messagePersister = new MessagePersister();
