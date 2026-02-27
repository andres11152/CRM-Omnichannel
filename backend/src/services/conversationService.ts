import { prisma } from "@/config/database";
import { contactRepository } from "@/repositories/ContactRepository";
import { AppError } from "@/utils/AppError";
import { chatSyncService } from "./chatSyncService";
import { ConversationManager } from "./conversationManager";
import { whatsappService, SendMessageOptions } from "@/whatsapp";
import { gateway } from "@/gateways/socketGateway";
import { contactService } from "./contactService";
import {
  Channel,
  Conversation,
  Message,
  Prisma,
  TicketStatus,
} from "@prisma/client";
import { Logger } from "@/utils/logger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  CreateConversationDTO,
  ReplyDTO,
  ConversationListItem,
  Attachment,
} from "@/types/conversation.types";

// Repositories
import { UserRepository } from "@/repositories/UserRepository";
import { MessageRepository } from "@/repositories/MessageRepository";
import { TicketRepository } from "@/repositories/TicketRepository";
import { ConversationRepository } from "@/repositories/ConversationRepository";

const userRepository = new UserRepository();
const messageRepository = new MessageRepository();
const ticketRepository = new TicketRepository();
const conversationRepository = new ConversationRepository();

// Instantiate Manager
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
    // Every conversation MUST have a ticket to be manageable.
    const existingTicket = await ticketRepository.findByConversationId(
      conversation.id,
    );

    const isTicketActive =
      existingTicket &&
      (existingTicket.status === TicketStatus.OPEN ||
        existingTicket.status === TicketStatus.IN_PROGRESS);

    if (!isTicketActive) {
      const lastTicket = await ticketRepository.findFirst({
        where: { companyId },
        orderBy: { ticketNumber: "desc" },
        select: { ticketNumber: true },
      });

      const nextTicketNumber = (lastTicket?.ticketNumber || 0) + 1;

      await ticketRepository.create({
        data: {
          ticketNumber: nextTicketNumber,
          companyId,
          conversationId: conversation.id,
          subject: name || cleanPhone,
          description: message || "Chat importado o iniciado manualmente",
          createdById: agentId,
          assignedToId: agentId, // Auto-assign to the creator (Agent)
          status: TicketStatus.IN_PROGRESS, // Active state
        },
      });
    }

    return conversation;
  },

  async sendMessageToWhatsApp(
    companyId: string,
    conversationId: string,
    senderId: string,
    phone: string,
    content: string,
    attachment?: Attachment,
    metadata?: Record<string, unknown>,
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
    } catch (e) {
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
      const lastMsg = conv.messages[conv.messages.length - 1];
      const unreadCount = conv.messages.filter(
        (m) => m.direction === "INBOUND" && m.status !== "READ",
      ).length;

      return {
        id: conv.id,
        ticketId: conv.id,
        contactName: customer?.name || conv.subject || "Usuario",
        contactPhone: customer?.phone || conv.channelId || "",
        lastMessage: lastMsg?.content || "Nueva conversación",
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
    // Determine type by initial assignment
    let conversation = await conversationRepository.findByIdWithRelations(id);

    if (!conversation) {
      const ticket = await ticketRepository.findByIdWithCreator(id);
      if (ticket && ticket.companyId === companyId) {
        if (ticket.conversationId) {
          conversation = await conversationRepository.findByIdWithRelations(
            ticket.conversationId,
          );
        } else {
          const customerId = ticket.createdById;
          const channelId =
            ticket.createdBy.phone || ticket.createdBy.email.split("@")[0];

          // 🛡️ 100-YEAR FIX: Use intermediate variable to avoid type mismatch
          // Manager returns basic Conversation, Repository returns ConversationWithRelations
          const newConv = await conversationManager.findOrCreate({
            companyId,
            channelId,
            customerId,
            subject: ticket.subject,
            status: "OPEN",
          });

          await ticketRepository.updateConversationId(ticket.id, newConv.id);

          // Re-fetch with FULL relations to satisfy type
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
      const meta = (
        msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {}
      ) as { media?: Attachment; attachment?: Attachment };
      return {
        ...msg,
        attachment: meta.media || meta.attachment,
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

    // 🚀 CONTEXT SYNC: Auto-backfill if conversation has few messages
    // This is the JIT trigger — fires async, doesn't block the response
    const CONTEXT_SYNC_THRESHOLD = 20;
    const cleanChannelId = conversation.channelId
      ? conversation.channelId.replace(/\D/g, "")
      : "";
    const hasValidPhone = cleanChannelId && /^\d{5,15}$/.test(cleanChannelId);

    if (
      messagesWithProps.length < CONTEXT_SYNC_THRESHOLD &&
      hasValidPhone &&
      !conversation.isGroup
    ) {
      // Fire-and-forget: don't await, don't block
      chatSyncService
        .contextSync(companyId, conversation.id, conversation.channelId!)
        .catch((err) =>
          Logger.warn(`[ConversationService] Context sync failed:`, err),
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
  ): Promise<Message | { id: string; content: string }> {
    const {
      companyId,
      userId,
      conversationId,
      content,
      channel,
      attachment,
      metadata,
      scheduledAt,
    } = dto;

    let resolvedConv =
      await conversationRepository.findByIdWithRelations(conversationId);

    if (!resolvedConv) {
      const ticket = await ticketRepository.findById(conversationId);
      if (ticket?.conversationId) {
        resolvedConv = await conversationRepository.findByIdWithRelations(
          ticket.conversationId,
        );
      }
    }

    if (!resolvedConv || resolvedConv.companyId !== companyId) {
      throw new AppError("Conversation not found", 404);
    }

    let targetPhone = resolvedConv.channelId;
    if (!targetPhone || !/^\d+$/.test(targetPhone)) {
      const linkedTicket = await ticketRepository.findByConversationId(
        resolvedConv.id,
      );
      const emailPhone = linkedTicket?.createdBy.email.split("@")[0];
      if (emailPhone && /^\d+$/.test(emailPhone)) targetPhone = emailPhone;
    }

    if (!targetPhone || targetPhone.length < 5) {
      throw new AppError("Cannot determine recipient phone number", 400);
    }

    const messageContent =
      content ||
      (attachment ? `📎 Archivo: ${attachment.name || "Adjunto"}` : "");

    if (scheduledAt) {
      const safeMetadata = {
        ...(metadata || {}),
        scheduledAt:
          typeof scheduledAt === "string"
            ? scheduledAt
            : scheduledAt.toISOString(),
        attachment,
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
          metadata: safeMetadata as unknown as Prisma.InputJsonValue,
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
        metadata,
      };

      const sentMessage = await whatsappService.sendMessage(
        targetPhone,
        messageContent,
        options,
      );

      // 🛡️ 100-YEAR FIX: Return the message derived from the Service
      // Do NOT manually create another record here to avoid Double Write.
      return sentMessage as unknown as Message;
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
};
