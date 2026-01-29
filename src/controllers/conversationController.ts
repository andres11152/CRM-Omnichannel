import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { prisma } from "@/config/database";
import { whatsappService } from "@/whatsapp";
import { gateway } from "@/gateways/socketGateway";
import { Logger } from "@/utils/logger";
import { Channel, Prisma } from "@prisma/client";

// 🛡️ 100-YEAR FIX: Use Prisma generated types for perfect sync with Schema
type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: {
    participants: true;
    assignedTo: true;
    messages: true;
  };
}>;

// 🛡️ Type Guard for Channel enum
function isValidChannel(channel: unknown): channel is Channel {
  return Object.values(Channel).includes(channel as Channel);
}

export const createConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { phone, name, message } = req.body;

    if (!phone) throw new AppError("Phone number is required", 400);
    if (!req.companyId || !req.user) throw new AppError("Not authorized", 401);

    const cleanPhone = phone.replace(/[^\d]/g, "");
    const email = `${cleanPhone}@whatsapp.user`;

    const existingUser = await prisma.user.findUnique({ where: { email } });

    const customer = await prisma.user.upsert({
      where: { email },
      update: {
        ...(name &&
          existingUser &&
          (existingUser.name === cleanPhone ||
            existingUser.name === "Usuario WhatsApp" ||
            !existingUser.name) && { name }),
      },
      create: {
        email,
        name: name || cleanPhone,
        password: "$2a$10$DummyHashForCustomerUser123456",
        role: "USER",
        companyId: req.companyId,
        phone: cleanPhone,
      },
    });

    let conversation = await prisma.conversation.findFirst({
      where: {
        companyId: req.companyId,
        OR: [
          { channelId: cleanPhone },
          { participants: { some: { phone: cleanPhone } } },
          { participants: { some: { email: `${cleanPhone}@whatsapp.user` } } },
        ],
        status: "OPEN",
      },
      include: { participants: true, messages: true },
      orderBy: { createdAt: "desc" },
    });

    if (conversation) {
      return res.status(200).json({
        status: "success",
        data: { conversation },
      });
    }

    conversation = await prisma.conversation.create({
      data: {
        companyId: req.companyId,
        subject: customer.name,
        status: "OPEN",
        participants: {
          connect: [{ id: customer.id }, { id: req.user.id }],
        },
        channelId: cleanPhone,
      },
      include: { participants: true, messages: true },
    });

    const ticketCount = await prisma.ticket.count({
      where: { companyId: req.companyId },
    });

    await prisma.ticket.create({
      data: {
        ticketNumber: ticketCount + 1,
        subject: `Chat con ${name || phone}`,
        description: message || "Chat iniciado manualmente por agente",
        status: "OPEN",
        priority: "MEDIUM",
        companyId: req.companyId,
        createdById: customer.id,
        assignedToId: req.user.id,
        conversationId: conversation.id,
      },
    });

    if (message) {
      try {
        await whatsappService.sendMessage(cleanPhone, message, {
          companyId: req.companyId,
          conversationId: conversation.id,
          senderId: req.user.id,
        });
      } catch (e) {
        Logger.error(
          "[Conversation] Failed to send initial WhatsApp message",
          e,
        );
        const failedMsg = await prisma.message.create({
          data: {
            content: message,
            companyId: req.companyId,
            conversationId: conversation.id,
            senderId: req.user.id,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            status: "FAILED",
          },
          include: { sender: true },
        });

        gateway.emitToCompany(req.companyId, "message:new", {
          conversationId: conversation.id,
          message: failedMsg,
        });
      }
    }

    const { addToContacts } = req.body;
    if (addToContacts) {
      const existingContact = await prisma.contact.findFirst({
        where: { companyId: req.companyId, phone: phone },
      });

      if (!existingContact) {
        await prisma.contact.create({
          data: {
            companyId: req.companyId,
            name: name || phone,
            phone: phone,
            tags: ["Importado de Chat"],
          },
        });
      }
    }

    res.status(201).json({
      status: "success",
      data: { conversation },
    });
  },
);

export const listConversations = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);
    const conversations = await prisma.conversation.findMany({
      where: { companyId: req.companyId },
      orderBy: { updatedAt: "desc" },
      include: {
        participants: true,
        assignedTo: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    const mappedConversations = conversations.map((conv) => {
      // Logic from SocketEventEmitter to identify customer
      const customer = conv.participants.find(
        (p) => p.role === "USER" || p.phone === conv.channelId,
      );

      const contactName = customer?.name || conv.subject || "Usuario";
      const contactPhone = customer?.phone || conv.channelId || "";

      const lastMsg = conv.messages[conv.messages.length - 1];
      const unreadCount = conv.messages.filter(
        (m) => m.direction === "INBOUND" && m.status !== "READ",
      ).length;

      return {
        id: conv.id,
        ticketId: conv.id,
        contactName,
        contactPhone,
        lastMessage: lastMsg?.content || "Nueva conversación",
        lastMessageTime: lastMsg?.createdAt || conv.updatedAt,
        unreadCount, // Calculated (or use stored field if exists)
        status: conv.status.toLowerCase(),
        assignedTo: conv.assignedTo?.name,
        channel: "whatsapp", // Hardcoded for now or derive from channelId
        tags: [], // Tags stored separately, fetch if needed
        participants: conv.participants,
      };
    });

    res.status(200).json({
      status: "success",
      results: mappedConversations.length,
      data: { conversations: mappedConversations },
    });
  },
);

export const getConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) throw new AppError("Not authorized", 401);
    let conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        participants: true,
        assignedTo: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: req.params.id },
        include: { createdBy: true },
      });

      if (ticket) {
        if (ticket.conversationId) {
          conversation = await prisma.conversation.findUnique({
            where: { id: ticket.conversationId },
            include: { participants: true, assignedTo: true, messages: true },
          });
        } else {
          Logger.info(
            `[Conversation] Creating new conversation for ticket ${ticket.id}`,
          );
          conversation = await prisma.conversation.create({
            data: {
              companyId: ticket.companyId,
              subject: ticket.subject,
              status: "OPEN",
              participants: { connect: [{ id: ticket.createdById }] },
            },
            include: { participants: true, assignedTo: true, messages: true },
          });

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { conversationId: conversation.id },
          });

          conversation = (await prisma.conversation.findUnique({
            where: { id: conversation.id },
            include: {
              participants: true,
              assignedTo: true,
              messages: { orderBy: { createdAt: "asc" } },
            },
          })) as ConversationWithRelations | null;
        }
      }
    }

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("No conversation found with that ID", 404);
    }

    const conversationWithTransformed = {
      ...conversation,
      messages: conversation.messages.map((msg) => ({
        ...msg,
        attachment:
          (msg.metadata as Record<string, unknown>)?.media ||
          (msg.metadata as Record<string, unknown>)?.attachment ||
          undefined,
      })),
    };

    res.status(200).json({
      status: "success",
      data: { conversation: conversationWithTransformed },
    });
  },
);

export const replyToConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user || !req.companyId) throw new AppError("Not authorized", 401);
    const {
      content,
      channel,
      attachment,
      phone: bodyPhone,
      metadata,
    } = req.body;

    let conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { participants: true },
    });

    if (!conversation) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: req.params.id },
        include: { createdBy: true },
      });

      if (ticket) {
        if (ticket.conversationId) {
          conversation = await prisma.conversation.findUnique({
            where: { id: ticket.conversationId },
            include: { participants: true },
          });
        } else {
          conversation = await prisma.conversation.create({
            data: {
              companyId: ticket.companyId,
              subject: ticket.subject,
              status: "OPEN",
              participants: { connect: [{ id: ticket.createdById }] },
              channelId: ticket.createdBy.email.split("@")[0],
            },
            include: { participants: true },
          });

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { conversationId: conversation.id },
          });

          conversation = await prisma.conversation.findUnique({
            where: { id: conversation.id },
            include: { participants: true },
          });
        }
      }
    }

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("No conversation found with that ID", 404);
    }

    let targetPhone = bodyPhone;
    if (!targetPhone) {
      if (conversation.channelId && /^\d+$/.test(conversation.channelId)) {
        targetPhone = conversation.channelId;
      } else {
        const linkedTicket = await prisma.ticket.findFirst({
          where: { conversationId: conversation.id },
          include: { createdBy: true },
        });

        if (linkedTicket?.createdBy?.email?.includes("@whatsapp.user")) {
          const potentialPhone = linkedTicket.createdBy.email.split("@")[0];
          if (/^\d+$/.test(potentialPhone)) targetPhone = potentialPhone;
        }
      }
    }

    if (!targetPhone) {
      Logger.error(
        `[Conversation] Failed to resolve phone for ConvID: ${conversation.id}`,
      );
      throw new AppError("Cannot determine recipient phone number", 400);
    }

    targetPhone = targetPhone.includes("@")
      ? targetPhone
      : targetPhone.replace(/[^\d]/g, "");
    if (targetPhone.length < 5) throw new AppError("Invalid phone number", 400);

    const messageContent =
      content ||
      (attachment
        ? attachment.type === "image"
          ? "📷 Imagen"
          : `📎 Archivo: ${attachment.name || "Adjunto"}`
        : "");

    let message;
    const isScheduled = req.body.scheduledAt;

    if (isScheduled) {
      message = await prisma.message.create({
        data: {
          content: messageContent,
          channel: isValidChannel(channel) ? channel : Channel.WHATSAPP,
          direction: "OUTBOUND",
          conversationId: conversation.id,
          senderId: req.user.id,
          status: "SCHEDULED",
          metadata: {
            ...(metadata as Record<string, unknown>), // Preserve tempId
            scheduledAt: req.body.scheduledAt,
            attachment: attachment || undefined,
          },
        },
        include: { sender: true },
      });
    } else if (channel === "WHATSAPP") {
      try {
        message = await whatsappService.sendMessage(
          targetPhone,
          messageContent,
          {
            companyId: req.companyId,
            conversationId: conversation.id,
            senderId: req.user.id,
            media: attachment,
            metadata: metadata, // 🎯 100-YEAR FIX: Preserve tempId for deduplication
          },
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Logger.error("[Conversation] Failed to send WhatsApp message", {
          error: errorMessage,
        });
        throw new AppError(
          `Failed to send message via WhatsApp: ${errorMessage}`,
          502,
        );
      }
    } else {
      message = await prisma.message.create({
        data: {
          content: messageContent,
          channel: isValidChannel(channel) ? channel : Channel.WEB_CHAT,
          direction: "OUTBOUND",
          conversationId: conversation.id,
          senderId: req.user.id,
          metadata: metadata as Prisma.InputJsonValue, // 🎯 100-YEAR FIX: Preserve tempId
        },
        include: { sender: true },
      });
    }

    res.status(201).json({
      status: "success",
      data: { message },
    });
  },
);

export const updateTags = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { tags } = req.body;
    if (!Array.isArray(tags)) throw new AppError("Tags must be an array", 400);

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
    });

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("Conversation not found", 404);
    }

    await prisma.$executeRaw`
        UPDATE conversations SET tags = ${tags} WHERE id = ${req.params.id}
    `;

    res.status(200).json({
      status: "success",
      data: { tags },
    });
  },
);
