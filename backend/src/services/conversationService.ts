// ⚠️ ARCHITECTURAL NOTE: `prisma` is imported here ONLY to inject into ConversationManager
// as a Unit of Work (Transaction Client). This is NOT a leakage — the Manager uses $transaction
// for atomic findOrCreate operations. All other DB access uses repositories.
import { prisma } from "@/config/database";
import { contactRepository } from "@/repositories/ContactRepository";
import { AppError } from "@/utils/AppError";
import { ConversationManager } from "./conversationManager";
import { whatsappService, SendMessageOptions } from "@/whatsapp";
import { gateway } from "@/gateways/socketGateway";
import { contactService } from "./contactService";
import {
  Channel,
  Conversation,
  Message,
  Prisma,
} from "@prisma/client";
import { ticketSyncService } from "./TicketSyncService";
import { Logger } from "@/utils/logger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  CreateConversationDTO,
  ReplyDTO,
  ConversationListItem,
  Attachment,
  Metadata,
} from "@/types/conversation.types";

// Repositories
import { UserRepository } from "@/repositories/UserRepository";
import { MessageRepository } from "@/repositories/MessageRepository";
import { ConversationRepository } from "@/repositories/ConversationRepository";

const userRepository = new UserRepository();
const messageRepository = new MessageRepository();
const conversationRepository = new ConversationRepository();

// Instantiate Manager (receives prisma for $transaction — Unit of Work pattern)
const conversationManager = new ConversationManager(prisma, {
  onCreated: (conv) => {
    gateway.emitToCompany(conv.companyId, "conversation:new", conv);
  },
  onUpdated: (conv) => {
    gateway.emitToCompany(conv.companyId, "conversation:update", conv);
  },
});

export const conversationService = {
  /**
   * Create or Retrieve a Conversation
   */
  async createConversation(dto: CreateConversationDTO): Promise<Conversation> {
    const { companyId, agentId, phone, name, message, addToContacts } = dto;

    const cleanPhone = phone.replace(/[^\d]/g, "");
    if (cleanPhone.length < 5) throw new AppError("Invalid phone number", 400);

    const email = `${cleanPhone}@whatsapp.user`;

    const existingUser = await userRepository.findByEmail(email);

    const securePassword =
      existingUser?.password ||
      (await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10));

    const customer = await userRepository.upsertShadowUser({
      email,
      name: name || cleanPhone,
      phone: cleanPhone,
      companyId,
      password: securePassword,
      preferences: {},
    });

    const conversation = await conversationManager.findOrCreate({
      companyId,
      channelId: cleanPhone,
      customerId: customer.id,
      subject: customer.name || cleanPhone,
      status: "OPEN",
    });

    if (message) {
      await this.sendMessageToWhatsApp(
        companyId,
        conversation.id,
        agentId,
        cleanPhone,
        message,
      );
    }

    if (addToContacts) {
      const contact = await contactService.upsert(companyId, {
        phone: cleanPhone,
        name: name || cleanPhone,
        tags: ["Importado de Chat"],
      });

      // 🛡️ 100-YEAR FIX: Link Contact to Conversation immediately
      await conversationRepository.update(conversation.id, {
        contact: { connect: { id: contact.id } },
      });
    }

    // 🛡️ 100-YEAR FIX: Ensure Ticket Exists for visibility in Agent Workspace
    await ticketSyncService.ensureActiveTicket({
      companyId,
      conversationId: conversation.id,
      agentId,
      subject: name || cleanPhone,
      description: message || "Chat importado o iniciado manualmente",
    });

    return conversation;
  },

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
      media: attachment
        ? {
            type: attachment.type,
            url: attachment.url,
            mimetype:
              attachment.mimetype ||
              attachment.mimeType ||
              "application/octet-stream",
            filename: attachment.name,
            caption: attachment.name,
          }
        : undefined,
      metadata,
    };

    try {
      await whatsappService.sendMessage(phone, content, options);
    } catch (e: unknown) {
      // Explicitly type catch variable
      Logger.error("[ConversationService] Failed to send message", e);
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
  },

  async listConversations(
    companyId: string,
    userId: string,
    role: string,
  ): Promise<ConversationListItem[]> {
    const whereClause: Prisma.ConversationWhereInput = { companyId };
    if (role === "AGENT") {
      whereClause.assignedToId = userId;
    }

    const conversations = await conversationRepository.findAll(whereClause, {
      take: 50,
    });

    return conversations.map((conv) => {
      const customer = conv.participants.find(
        (p) => p.role === "USER" || p.phone === conv.channelId,
      );
      const lastMsg = conv.messages[0];
      const unreadCount = conv.messages.filter(
        (m) => m.direction === "INBOUND" && m.status !== "READ",
      ).length;

      // 🛡️ Map last message content for sidebar display
      let lastMsgSnippet = lastMsg?.content || "Nueva conversación";
      if (!lastMsg?.content && lastMsg?.metadata) {
        const metadata = lastMsg.metadata as Metadata;
        const media = metadata.media || metadata.attachment;
        if (media) {
          if (media.type === "image") lastMsgSnippet = "[📷 Imagen]";
          else if (media.type === "video") lastMsgSnippet = "[🎬 Video]";
          else if (media.type === "audio") lastMsgSnippet = "[🎤 Audio]";
          else if (media.type === "document") lastMsgSnippet = "[📄 Documento]";
          else if (media.type === "sticker") lastMsgSnippet = "[Sticker]";
        }
      }

      return {
        id: conv.id,
        ticketId: conv.id,
        contactName: customer?.name || conv.subject || "Usuario",
        contactPhone: customer?.phone || conv.channelId || "",
        lastMessage: lastMsgSnippet,
        lastMessageTime: lastMsg?.createdAt || conv.updatedAt,
        unreadCount,
        status: conv.status.toLowerCase(),
        assignedTo: conv.assignedTo?.name,
        channel: "whatsapp",
        participants: conv.participants,
      };
    });
  },

  /**
   * Get Detail
   */
  async getConversation(companyId: string, id: string) {
    let conversation = await conversationRepository.findByIdWithRelations(id);

    if (!conversation) {
      const ticket = await ticketSyncService.findByIdWithCreator(id);
      if (ticket && ticket.companyId === companyId) {
        if (ticket.conversationId) {
          conversation = await conversationRepository.findByIdWithRelations(
            ticket.conversationId,
          );
        } else {
          const customerId = ticket.createdById;
          const channelId =
            ticket.createdBy.phone || ticket.createdBy.email.split("@")[0];

          const newConv = await conversationManager.findOrCreate({
            companyId,
            channelId,
            customerId,
            subject: ticket.subject,
            status: "OPEN",
          });

          await ticketSyncService.updateConversationId(ticket.id, newConv.id);

          conversation = await conversationRepository.findByIdWithRelations(
            newConv.id,
          );
        }
      }
    }

    if (!conversation || conversation.companyId !== companyId) {
      throw new AppError("Conversation not found", 404);
    }

    const messagesWithProps = conversation.messages.map((msg) => {
      const metadata = (
        msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {}
      ) as Metadata;
      const att = metadata.media || metadata.attachment;

      // 🛡️ Map Baileys/Prisma direction to Frontend 'sender' role
      let senderRole: "agent" | "customer" | "system" = "customer";
      if (msg.direction === "OUTBOUND") {
        senderRole = "agent";
      } else if ((msg.sender as { role?: string })?.role === "SYSTEM") {
        senderRole = "system";
      }

      return {
        ...msg,
        attachment: att,
        sender: senderRole,
        senderName: (msg.sender as { name?: string })?.name || "Usuario",
        type: att ? (att.type as string) : "text",
        mediaUrl: att?.url || undefined,
      };
    });

    // 🛡️ 100-YEAR FIX: Prioritize Contact Tags
    // If a contact is linked, their tags are the source of truth for the user perspective.
    let resolvedTags = conversation.tags;

    if (conversation.contactId) {
      const contact = await contactRepository.findFirst({
        where: { id: conversation.contactId },
        select: { tags: true },
      });
      if (contact?.tags && contact.tags.length > 0) {
        resolvedTags = contact.tags;
      }
    }

    // 🚀 ON-DEMAND CONTEXT SYNC: Backfill messages from Baileys store when agent opens chat
    // Triggers only when DB has fewer than CONTEXT_SYNC_THRESHOLD messages for this conversation.
    const CONTEXT_SYNC_THRESHOLD = 20;
    const cleanChannelId = conversation.channelId
      ? conversation.channelId.replace(/\D/g, "")
      : "";
    const hasValidPhone = cleanChannelId && /^\d{5,15}$/.test(cleanChannelId);

    if (
      messagesWithProps.length < CONTEXT_SYNC_THRESHOLD &&
      hasValidPhone
    ) {
      const { chatSyncService } = await import("./chatSyncService");
      chatSyncService
        .contextSync(companyId, conversation.id, conversation.channelId!)
        .catch((err: Error) =>
          Logger.warn(`[ConversationService] Context sync failed:`, {
            error: err.message,
          }),
        );
    }

    return {
      ...conversation,
      tags: resolvedTags,
      messages: messagesWithProps,
    };
  },

  async replyToConversation(
    dto: ReplyDTO,
  ): Promise<Message | { id: string; content: string; timestamp?: Date; status?: string }> {
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

    let resolvedConv =
      await conversationRepository.findByIdWithRelations(conversationId);

    if (!resolvedConv) {
      const ticketConvId = await ticketSyncService.findConversationIdByTicket(conversationId, companyId);
      if (ticketConvId) {
        resolvedConv = await conversationRepository.findByIdWithRelations(ticketConvId);
      }
    }

    if (!resolvedConv || resolvedConv.companyId !== companyId) {
      throw new AppError("Conversation not found", 404);
    }

    let targetPhone = resolvedConv.channelId;
    if (!targetPhone || !/^\d+$/.test(targetPhone)) {
      targetPhone = (await ticketSyncService.findPhoneByConversation(resolvedConv.id)) || null;
    }

    if (!targetPhone || targetPhone.length < 5) {
      throw new AppError("Cannot determine recipient phone number", 400);
    }

    const messageContent =
      content ||
      (attachment ? `📎 Archivo: ${attachment.name || "Adjunto"}` : "");

    if (scheduledAt) {
      const safeMetadata: Metadata = {
        ...(metadata || {}),
        scheduledAt:
          typeof scheduledAt === "string"
            ? scheduledAt
            : scheduledAt.toISOString(),
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
    } else {
      const options: SendMessageOptions = {
        companyId,
        conversationId: resolvedConv.id,
        senderId: userId,
        media: attachment
          ? {
              type: attachment.type,
              url: attachment.url,
              mimetype:
                attachment.mimetype ||
                attachment.mimeType ||
                "application/octet-stream",
              filename: attachment.name,
              caption: attachment.name,
            }
          : undefined,
        metadata: {
          ...metadata,
          quotedMessageId,
          quotedContent,
        },
        quotedMessageId,
      };

      const sentMessage = await whatsappService.sendMessage(
        targetPhone,
        messageContent,
        options,
      );

      // 🛡️ 100-YEAR FIX: Return a compatible partial message
      // Do NOT manually create another record here to avoid Double Write.
      return {
        id: sentMessage.messageId,
        content: sentMessage.content,
        timestamp: sentMessage.timestamp,
        status: "SENT",
      };
    }
  },

  async updateTags(companyId: string, id: string, tags: string[]) {
    const conv = await conversationRepository.findByIdWithRelations(id);
    if (!conv || conv.companyId !== companyId)
      throw new AppError("Not found", 404);

    // 1. Update Conversation Tags (Base requirement)
    const updatedConv = await conversationRepository.updateTags(id, tags);

    // 🛡️ 100-YEAR FIX: Sync Tags to Contact Entity for Persistence
    // Users expect tags to "stick" to the person (Contact), not just the current chat session.
    if (updatedConv.contactId) {
      try {
        await contactService.update(companyId, updatedConv.contactId, { tags });
        Logger.info(
          `[ConversationService] Synced tags to Contact ${updatedConv.contactId}`,
        );
      } catch (error) {
        Logger.warn(
          `[ConversationService] Failed to sync tags to contact: ${error}`,
        );
        // We don't fail the request if contact sync fails, preserving UX
      }
    } else {
      // Try to find contact by phone if contactId is missing (Legacy/Simpler setups)
      if (updatedConv.channelId) {
        const contact = await contactService.findOne(companyId, {
          phone: updatedConv.channelId,
        });
        if (contact) {
          await contactService.update(companyId, contact.id, { tags });
        }
      }
    }

    return updatedConv;
  },

  /**
   * Toggle Group Contact Synchronization
   */
  async updateSyncEnabled(companyId: string, id: string, enabled: boolean) {
    const conv = await conversationRepository.findFirst({
      where: { id, companyId },
    });
    if (!conv) throw new AppError("Conversation not found", 404);

    if (!conv.isGroup) {
      throw new AppError("Direct conversations always sync contacts", 400);
    }

    const updated = await conversationRepository.update(id, {
      syncEnabled: enabled,
    });

    // Notify UI via socket
    gateway.emitToCompany(companyId, "conversation:update", updated);

    Logger.info(
      `[ConversationService] 🔄 Sync ${enabled ? "ENABLED" : "DISABLED"} for group: ${conv.subject}`,
    );

    return updated;
  },
};
