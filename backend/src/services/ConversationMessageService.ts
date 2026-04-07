import { whatsappService, SendMessageOptions } from "@/whatsapp";
import { gateway } from "@/gateways/socketGateway";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import {
  Channel,
  Message,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import {
  ReplyDTO,
  Attachment,
  Metadata,
} from "@/types/conversation.types";

// Repositories
import { messageRepository } from "@/repositories/MessageRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { reactionRepository } from "@/repositories/ReactionRepository";
import { ticketSyncService } from "./TicketSyncService";

export class ConversationMessageService {
  /**
   * Primary Messaging Orchestrator (Reply from Agent)
   */
  async replyToConversation(
    dto: ReplyDTO,
  ): Promise<Message | { id: string; content: string; timestamp?: Date; status?: string, sender?: string }> {
    const {
      companyId,
      userId,
      conversationId,
      content,
      channel,
      attachment,
      metadata,
      scheduledAt,
      quotedMessageId,
      quotedContent,
    } = dto;

    // A. Resolve Conversation (Direct or via Ticket fallback)
    let resolvedConv = await conversationRepository.findByIdWithRelations(companyId, conversationId);
    if (!resolvedConv) {
      const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
      if (ticketConvId) {
        resolvedConv = await conversationRepository.findByIdWithRelations(companyId, ticketConvId);
      }
    }

    if (!resolvedConv || resolvedConv.companyId !== companyId) {
      throw new AppError("Conversation not found", 404);
    }

    // B. Determine Destination Phone
    // For WhatsApp, we need the clean phone number.
    // If the channelId is already a phone, use it. Otherwise, look up the contact or ticket.
    let targetPhone = resolvedConv.channelId;
    const isCleanPhone = !!(targetPhone && /^\d+$/.test(targetPhone.replace("@s.whatsapp.net", "")));

    if (!isCleanPhone) {
      // Priority 1: Use linked contact phone
      if (resolvedConv.contact?.phone) {
        targetPhone = resolvedConv.contact.phone;
      } else {
        // Priority 2: Fallback to ticket search
        targetPhone = (await ticketSyncService.findPhoneByConversation(resolvedConv.id)) || null;
      }
    }

    if (!targetPhone || targetPhone.length < 5) {
      throw new AppError("No se pudo determinar el numero de teléfono del destinatario.", 400);
    }

    const messageContent = content || (attachment ? `[FILE] Archivo: ${attachment.name || "Adjunto"}` : "");

    // C. Handle Scheduling
    if (scheduledAt) {
      const safeMetadata: Metadata = {
        ...(metadata || {}),
        scheduledAt: typeof scheduledAt === "string" ? scheduledAt : scheduledAt.toISOString(),
        attachment,
        quotedMessageId,
        quotedContent,
      };

      return await messageRepository.create({
        data: {
          companyId,
          conversationId: resolvedConv.id,
          content: messageContent,
          direction: "OUTBOUND",
          senderId: userId,
          channel: channel || Channel.WHATSAPP,
          status: "SCHEDULED",
          metadata: safeMetadata as Prisma.InputJsonValue,
        },
      });
    }

    // D. Direct Send (WhatsApp)
    const options: SendMessageOptions = {
      companyId,
      conversationId: resolvedConv.id,
      senderId: userId,
      media: attachment ? {
        type: attachment.type,
        url: attachment.url,
        mimetype: attachment.mimetype || attachment.mimeType || "application/octet-stream",
        filename: attachment.name,
        caption: attachment.name,
      } : undefined,
      metadata: { ...metadata, quotedMessageId, quotedContent },
      quotedMessageId,
    };

    const sent = await whatsappService.sendMessage(targetPhone, messageContent, options);

    return {
      id: sent.messageId,
      content: sent.content,
      timestamp: sent.timestamp,
      status: "SENT",
      sender: "agent",
    };
  }

  /**
   * Single-purpose message sender (Internal & Notifications)
   */
  async sendMessageToWhatsApp(
    companyId: string,
    conversationId: string,
    senderId: string,
    phone: string,
    content: string,
    attachment?: Attachment,
    metadata?: Metadata,
  ): Promise<void> {
    const options: SendMessageOptions = {
      companyId,
      conversationId,
      senderId,
      media: attachment ? {
        type: attachment.type,
        url: attachment.url,
        mimetype: attachment.mimetype || attachment.mimeType || "application/octet-stream",
        filename: attachment.name,
        caption: attachment.name,
      } : undefined,
      metadata,
    };

    try {
      await whatsappService.sendMessage(phone, content, options);
    } catch (e: unknown) {
      Logger.error("[MessageService] Failed to send notification", e);
      const failedMsg = await messageRepository.create({
        data: {
          companyId,
          conversationId,
          content,
          direction: "OUTBOUND",
          senderId,
          channel: "WHATSAPP",
          status: "FAILED",
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      gateway.emitToCompany(companyId, "message:new", {
        conversationId,
        message: failedMsg,
      });
    }
  }

  async reactToMessage(
    companyId: string,
    conversationId: string,
    messageId: string,
    reaction: string,
    userId: string,
  ): Promise<void> {
    const conv = await conversationRepository.findByIdAndCompanyId(conversationId, companyId);
    if (!conv) {
      const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
      if (ticketConvId) {
        const resolved = await conversationRepository.findByIdAndCompanyId(ticketConvId, companyId);
        if (resolved) {
          await this.reactToMessage(companyId, resolved.id, messageId, reaction, userId);
          return;
        }
      }
      throw new AppError("Conversation not found", 404);
    }

    const msg = await messageRepository.findFirst({
      where: { id: messageId, companyId },
    });
    if (!msg || !msg.whatsappMessageId) throw new AppError("Message not found", 404);

    let targetPhone = conv.channelId;
    if (!targetPhone || !/^\d+$/.test(targetPhone)) {
      targetPhone = (await ticketSyncService.findPhoneByConversation(conv.id)) || null;
    }

    if (!targetPhone) throw new AppError("Target phone not found", 400);

    // 1. Send to WhatsApp (with proper origin tracking for reactions)
    const fromMe = msg.direction === MessageDirection.OUTBOUND;
    await whatsappService.sendReaction(targetPhone, msg.whatsappMessageId, reaction, companyId, fromMe);

    // 2. Local DB
    if (!reaction) {
      await reactionRepository.removeReaction(msg.id, userId, companyId);
    } else {
      await reactionRepository.upsertReaction({
        messageId: msg.id,
        reactBy: userId,
        content: reaction,
        companyId,
      });
    }

    // 3. Socket
    gateway.emitToCompany(companyId, "message:reaction", {
      messageId: msg.id,
      conversationId: conv.id,
      reaction,
      reactBy: userId,
    });
  }
}

export const conversationMessageService = new ConversationMessageService();
