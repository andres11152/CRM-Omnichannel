import { whatsappMessagingService, SendMessageOptions } from "@/whatsapp";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { gateway } from "@/gateways/socketGateway";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { prisma } from "@/config/database";
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

// Instagram
import { instagramSessionRepository } from "@/instagram/InstagramSessionRepository";
import { instagramProviderService, InstagramMediaContent } from "@/instagram/InstagramProviderService";

export class ConversationMessageService {
  /**
   * Primary Messaging Orchestrator (Reply from Agent)
   */
  async replyToConversation(
    dto: ReplyDTO,
  ): Promise<Message | { id: string; content: string; timestamp?: Date; status?: string, sender?: string; metadata?: unknown; type?: string; mediaUrl?: string }> {
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

    // A. Resolve Conversation (Direct or via Ticket fallback) - Optimized to be lightweight
    let resolvedConv = await conversationRepository.findFirst({
      where: { id: conversationId, companyId },
      include: { contact: true },
    });
    if (!resolvedConv) {
      const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
      if (ticketConvId) {
        resolvedConv = await conversationRepository.findFirst({
          where: { id: ticketConvId, companyId },
          include: { contact: true },
        });
      }
    }

    if (!resolvedConv || resolvedConv.companyId !== companyId) {
      throw new AppError("Conversation not found", 404);
    }

    const messageContent = content || "";

    // B. Handle Scheduling (channel-agnostic: just persists a SCHEDULED row;
    // the scheduled-send cron currently only dispatches WhatsApp — see plan notes)
    if (scheduledAt) {
      const safeMetadata: Metadata = {
        ...(metadata || {}),
        scheduledAt: typeof scheduledAt === "string" ? scheduledAt : scheduledAt.toISOString(),
        attachment,
        quotedMessageId,
        quotedContent,
        type: attachment ? attachment.type : "text",
        mediaUrl: attachment ? attachment.url : undefined,
      };

      return await messageRepository.create({
        data: {
          companyId,
          conversationId: resolvedConv.id,
          content: messageContent,
          direction: "OUTBOUND",
          senderId: userId,
          channel: channel || resolvedConv.channel,
          status: "SCHEDULED",
          metadata: safeMetadata as Prisma.InputJsonValue,
        },
      });
    }

    // C1. Handle Whispering (bypass WhatsApp/Instagram send)
    if (metadata?.isWhisper === true) {
      const savedMessage = await messageRepository.create({
        data: {
          companyId,
          conversationId: resolvedConv.id,
          content: messageContent,
          direction: "OUTBOUND",
          senderId: userId,
          channel: resolvedConv.channel,
          status: "SENT",
          metadata: {
            ...metadata,
            attachment,
            type: attachment ? attachment.type : "text",
            mediaUrl: attachment ? attachment.url : undefined,
          } as Prisma.InputJsonValue,
        },
        include: {
          sender: true,
        }
      });

      // Get conversation with participants for socket update
      const convWithRels = await conversationRepository.findFirst({
        where: { id: resolvedConv.id, companyId },
        include: {
          participants: true,
          assignedTo: true,
          contact: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          }
        }
      });

      if (convWithRels) {
        const { SocketEventEmitter } = await import("./SocketEventEmitter");
        const socketEmitter = new SocketEventEmitter(gateway);
        
        const ticket = await prisma.ticket.findFirst({
          where: { conversationId: resolvedConv.id, companyId, status: { in: ["OPEN", "IN_PROGRESS"] } }
        });
        
        socketEmitter.emitMessageSent(savedMessage, convWithRels, ticket?.id || resolvedConv.id);
      }

      return {
        id: savedMessage.id,
        content: savedMessage.content,
        timestamp: savedMessage.createdAt,
        status: "SENT",
        sender: "agent",
        metadata: savedMessage.metadata,
        type: attachment ? attachment.type : "text",
        mediaUrl: attachment ? attachment.url : undefined,
      };
    }

    // C. Channel routing: Instagram DMs never go through the WhatsApp JID
    // resolution / whatsappMessagingService path below.
    if (resolvedConv.channel === Channel.INSTAGRAM_DM) {
      return this.replyToInstagram(companyId, userId, resolvedConv.id, resolvedConv.channelId, messageContent, attachment, metadata, quotedMessageId, quotedContent);
    }

    // D. Determine Destination Phone / JID (WhatsApp only)
    // For groups: channelId is the group ID (e.g. 120363408109782390) which needs @g.us
    // For DMs: channelId is the phone number (e.g. 573138081081) which needs @s.whatsapp.net
    const initialTargetJid = WhatsAppIdUtils.getTargetJid(resolvedConv.channelId);
    const isGroup = resolvedConv.isGroup || initialTargetJid.endsWith("@g.us");
    let targetPhone = resolvedConv.channelId;

    if (!isGroup) {
      // Only for DMs: try to resolve a clean phone number if channelId is not one
      const isCleanPhone = !!(targetPhone && /^\d+$/.test(targetPhone.replace("@s.whatsapp.net", "")));

      if (!isCleanPhone) {
        // Priority 1: Use linked contact phone
        if (resolvedConv.contact?.phone) {
          targetPhone = resolvedConv.contact.phone;
        } else {
          // Priority 2: Fallback to ticket search
          targetPhone = (await ticketSyncService.findPhoneByConversation(companyId, resolvedConv.id)) || null;
        }
      }
    }

    if (!targetPhone || targetPhone.length < 5) {
      throw new AppError("No se pudo determinar el numero de teléfono del destinatario.", 400);
    }

    // [SEC] CRITICAL FIX: Use WhatsAppIdUtils to construct proper JID
    // Groups: 120363408109782390 → 120363408109782390@g.us
    // DMs:    573138081081       → 573138081081@s.whatsapp.net
    targetPhone = WhatsAppIdUtils.getTargetJid(targetPhone);

    const isAudio = attachment?.type === "audio";

    // E. Direct Send (WhatsApp)
    const options: SendMessageOptions = {
      companyId,
      conversationId: resolvedConv.id,
      senderId: userId,
      media: attachment ? {
        type: attachment.type,
        url: attachment.url,
        mimetype: attachment.mimetype || attachment.mimeType || "application/octet-stream",
        filename: attachment.name,
        caption: content || undefined,
      } : undefined,
      metadata: { 
        ...metadata, 
        quotedMessageId, 
        quotedContent, 
        attachment, 
        type: attachment ? attachment.type : "text", 
        mediaUrl: attachment ? attachment.url : undefined 
      },
      quotedMessageId,
    };

    const sent = await whatsappMessagingService.sendMessage(targetPhone, messageContent, options);

    return {
      id: sent.dbId || sent.messageId,
      content: sent.content,
      timestamp: sent.timestamp,
      status: "SENT",
      sender: "agent",
      metadata: {
        ...(sent.metadata || {}),
        attachment,
        type: attachment ? attachment.type : "text",
        mediaUrl: attachment ? attachment.url : undefined,
      },
      type: attachment ? attachment.type : "text",
      mediaUrl: attachment ? attachment.url : undefined,
    };
  }

  /**
   * Instagram DM send path (Reply from Agent).
   * Mirrors the shape of the WhatsApp direct-send branch above, but routes
   * through the Instagram Messaging API instead of Baileys/Meta WhatsApp.
   */
  private async replyToInstagram(
    companyId: string,
    userId: string,
    conversationId: string,
    igsid: string | null,
    messageContent: string,
    attachment: Attachment | undefined,
    metadata: Metadata | undefined,
    quotedMessageId: string | undefined,
    quotedContent: string | undefined,
  ): Promise<{ id: string; content: string; timestamp?: Date; status?: string; sender?: string; metadata?: unknown; type?: string; mediaUrl?: string }> {
    if (!igsid) {
      throw new AppError("No se pudo determinar el destinatario de Instagram.", 400);
    }

    const sessions = await instagramSessionRepository.findByCompany(companyId);
    const session = sessions.find((s) => s.status === "CONNECTED") || sessions[0];
    if (!session) {
      throw new AppError("No hay una sesión de Instagram conectada para esta empresa.", 400);
    }

    const mediaContent: InstagramMediaContent | null = attachment
      ? { type: attachment.type === "document" ? "file" : (attachment.type as "image" | "video" | "audio"), url: attachment.url }
      : null;

    const sendResult = await instagramProviderService.sendMessage(
      session.igBusinessAccountId,
      igsid,
      mediaContent || messageContent,
    );

    const savedMessage = await messageRepository.create({
      data: {
        companyId,
        conversationId,
        content: messageContent,
        direction: "OUTBOUND",
        senderId: userId,
        channel: Channel.INSTAGRAM_DM,
        status: "SENT",
        instagramMessageId: sendResult.messageId,
        metadata: {
          ...metadata,
          quotedMessageId,
          quotedContent,
          attachment,
          type: attachment ? attachment.type : "text",
          mediaUrl: attachment ? attachment.url : undefined,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      id: savedMessage.id,
      content: savedMessage.content,
      timestamp: savedMessage.createdAt,
      status: "SENT",
      sender: "agent",
      metadata: savedMessage.metadata,
      type: attachment ? attachment.type : "text",
      mediaUrl: attachment ? attachment.url : undefined,
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
        caption: content || undefined,
      } : undefined,
      metadata,
    };

    try {
      await whatsappMessagingService.sendMessage(phone, content, options);
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
      targetPhone = (await ticketSyncService.findPhoneByConversation(companyId, conv.id)) || null;
    }

    if (!targetPhone) throw new AppError("Target phone not found", 400);

    // 1. Send to WhatsApp (with proper origin tracking for reactions)
    const fromMe = msg.direction === MessageDirection.OUTBOUND;
    await whatsappMessagingService.sendReaction(targetPhone, msg.whatsappMessageId, reaction, companyId, fromMe);

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
