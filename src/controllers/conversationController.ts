import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { prisma } from "@/config/prisma";
import { whatsappService } from "@/services/whatsapp.service";
import { gateway } from "@/gateways/socketGateway";

export const createConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { phone, name, message } = req.body;

    if (!phone) {
      throw new AppError("Phone number is required", 400);
    }

    if (!req.companyId || !req.user) {
      throw new AppError("Not authorized", 401);
    }

    // Clean phone number (remove non-digits)
    const cleanPhone = phone.replace(/[^\d]/g, "");

    // 1. Check if user exists (Customer) - use same format as WhatsApp service
    const email = `${cleanPhone}@whatsapp.user`;
    let customer = await prisma.user.findFirst({
      where: {
        email,
        companyId: req.companyId,
      },
    });

    if (!customer) {
      // Create new customer user with proper name
      customer = await prisma.user.create({
        data: {
          email,
          name: name || cleanPhone, // Use provided name or phone as fallback
          password: "$2a$10$DummyHashForCustomerUser123456", // Dummy hash
          role: "USER",
          companyId: req.companyId,
        },
      });
    }

    // 2. Check if conversation already exists for this phone/channelId
    let conversation = await prisma.conversation.findFirst({
      where: {
        companyId: req.companyId,
        channelId: cleanPhone,
        status: "OPEN",
      },
      include: { participants: true, messages: true },
    });

    if (conversation) {
      // Conversation already exists, return it

      res.status(200).json({
        status: "success",
        data: { conversation },
      });
      return;
    }

    // 3. Create new Conversation if it doesn't exist
    conversation = await prisma.conversation.create({
      data: {
        companyId: req.companyId,
        subject: name || cleanPhone,
        status: "OPEN",
        participants: {
          connect: [{ id: customer.id }, { id: req.user.id }],
        },
        channelId: cleanPhone,
      },
      include: { participants: true, messages: true },
    });

    // 4. Create Ticket (only for new conversations)
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

    // 5. Send Message if provided
    if (message) {
      await prisma.message.create({
        data: {
          content: message,
          channel: "WHATSAPP",
          direction: "OUTBOUND",
          conversationId: conversation.id,
          senderId: req.user.id,
        },
      });

      // Send to WhatsApp
      try {
        await whatsappService.sendMessage(cleanPhone, message);
      } catch (e) {
        console.error("Failed to send initial WhatsApp message", e);
      }
    }

    // 5. Add to CRM Contacts if requested
    const { addToContacts } = req.body;
    if (addToContacts) {
      // Check if contact exists by phone
      const existingContact = await prisma.contact.findFirst({
        where: {
          companyId: req.companyId,
          phone: phone,
        },
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
  }
);

export const listConversations = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }
    const conversations = await prisma.conversation.findMany({
      where: { companyId: req.companyId },
      include: { participants: true, assignedTo: true, messages: true },
    });
    res.status(200).json({
      status: "success",
      results: conversations.length,
      data: { conversations },
    });
  }
);

export const getConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.companyId) {
      throw new AppError("Not authorized", 401);
    }
    let conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { participants: true, assignedTo: true, messages: true },
    });

    if (!conversation) {
      // Check if it's a Ticket ID
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
          // Create new conversation
          console.log(
            "[GetConv] Creating new conversation for ticket",
            ticket.id
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

          // Re-fetch
          conversation = (await prisma.conversation.findUnique({
            where: { id: conversation.id },
            include: { participants: true, assignedTo: true, messages: true },
          })) as any;
        }
      }
    }

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("No conversation found with that ID", 404);
    }

    // Transform messages to extract attachment from metadata for frontend compatibility
    const conversationWithTransformed = {
      ...conversation,
      messages: conversation.messages.map((msg: any) => ({
        ...msg,
        attachment: msg.metadata?.attachment || undefined,
      })),
    };

    res.status(200).json({
      status: "success",
      data: { conversation: conversationWithTransformed },
    });
  }
);

// ...

// ...

export const replyToConversation = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user || !req.companyId) {
      throw new AppError("Not authorized", 401);
    }
    const { content, channel, attachment } = req.body;

    let conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { participants: true },
    });

    // If no conversation found, check if it's a Ticket ID
    if (!conversation) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: req.params.id },
        include: { createdBy: true },
      });

      if (ticket) {
        // Check if ticket already has a conversation linked
        if (ticket.conversationId) {
          conversation = await prisma.conversation.findUnique({
            where: { id: ticket.conversationId },
            include: { participants: true },
          });
        } else {
          // Create new conversation for this ticket

          conversation = await prisma.conversation.create({
            data: {
              companyId: ticket.companyId,
              subject: ticket.subject,
              status: "OPEN",
              participants: { connect: [{ id: ticket.createdById }] }, // Add ticket creator as participant
              // Link back to ticket? No, ticket links to conversation.
            },
            include: { participants: true },
          });

          // Link ticket to conversation
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { conversationId: conversation.id },
          });

          // Re-fetch with participants to match type
          conversation = (await prisma.conversation.findUnique({
            where: { id: conversation.id },
            include: { participants: true },
          })) as any;
        }
      }
    }

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("No conversation or ticket found with that ID", 404);
    }

    // Find the customer (USER role)
    const customer = conversation.participants.find((p) => p.role === "USER");

    if (!customer || !customer.email) {
      console.warn(
        `[Reply] No customer found for conversation ${conversation.id}`
      );
    }

    const messageContent =
      content ||
      (attachment
        ? attachment.type === "image"
          ? "📷 Imagen"
          : `📎 Archivo: ${attachment.name || "Adjunto"}`
        : "");

    const message = await prisma.message.create({
      data: {
        content: messageContent,
        channel,
        direction: "OUTBOUND",
        conversationId: conversation.id,
        senderId: req.user.id,
        metadata: attachment ? { attachment } : undefined,
      },
    });

    // Send to WhatsApp if channel matches
    const shouldSendToWhatsapp =
      channel === "WHATSAPP" && !!customer && !!customer.email;

    if (shouldSendToWhatsapp && customer && customer.email) {
      const phone = customer.email.split("@")[0];
      try {
        await whatsappService.sendMessage(
          phone,
          messageContent,
          conversation.channelId || undefined,
          attachment
        );
      } catch (error) {
        console.error("[Reply] Failed to send WhatsApp message:", error);
      }
    }

    // Emit Socket Event for Outgoing Message
    const io = gateway.getIO();

    if (!io) {
      console.error("❌ [Reply] CRITICAL: Socket.io instance is NULL!");
    } else {
      console.log("✅ [Reply] Socket.io is ready, emitting message...");
    }

    const socketPayload = {
      ...message,
      ticketId: conversation.id,
      senderName: req.user.name || "Agente",
      senderType: "AGENT",
      attachment: attachment,
    };

    console.log("🚀 [Reply] Emitting socket 'message' event:", {
      ticketId: socketPayload.ticketId,
      content: socketPayload.content.substring(0, 50),
      hasAttachment: !!socketPayload.attachment,
    });

    io?.emit("message", socketPayload);
    console.log("✅ [Reply] Socket message emitted successfully");

    res.status(201).json({
      status: "success",
      data: { message: socketPayload },
    });
    console.log("✅ [Reply] HTTP Response sent to frontend");
  }
);

export const updateTags = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      throw new AppError("Tags must be an array", 400);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
    });

    if (!conversation || conversation.companyId !== req.companyId) {
      throw new AppError("Conversation not found", 404);
    }

    // Use raw query to update array column since Prisma might not sync schema yet
    await prisma.$executeRaw`
        UPDATE conversations 
        SET tags = ${tags}
        WHERE id = ${req.params.id}
    `;

    res.status(200).json({
      status: "success",
      data: { tags },
    });
  }
);
