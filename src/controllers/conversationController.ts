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

    // 1. Find or Create user (Customer) - Smart name handling
    const email = `${cleanPhone}@whatsapp.user`;

    // Check if user exists to preserve real WhatsApp name
    const existingUser = await prisma.user.findUnique({ where: { email } });

    const customer = await prisma.user.upsert({
      where: { email },
      update: {
        // Only update if current name is generic
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

    // 2. Check if conversation already exists with this PHONE NUMBER
    // 🔑 Search by phone, not user.id (prevents duplicates)
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
        subject: customer.name, // Use real WhatsApp name from DB
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
    // ✅ whatsappService.sendMessage handles BOTH sending AND persisting
    if (message) {
      try {
        await whatsappService.sendMessage(cleanPhone, message, {
          companyId: req.companyId,
          conversationId: conversation.id,
          senderId: req.user.id,
        });
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
    // RELAXED VALIDATION: We explicitly return the conversation data even if the phone number (channelId)
    // is corrupted (e.g. LID), so that the UI can load and the user can DELETE the ticket.
    const conversationWithTransformed = {
      ...conversation,
      messages: conversation.messages.map((msg: any) => ({
        ...msg,
        attachment:
          msg.metadata?.media || msg.metadata?.attachment || undefined,
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
    const { content, channel, attachment, phone: bodyPhone } = req.body;

    // 🔍 CRITICAL DEBUG: Log ALL requests, especially with attachments
    console.log("🎯 [Reply] Request received:", {
      conversationId: req.params.id,
      content: content || "[empty]",
      channel,
      hasAttachment: !!attachment,
      attachmentType: attachment?.type,
      phone: bodyPhone,
    });

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
              channelId: ticket.createdBy.email.split("@")[0], // Attempt to infer channel ID from user email
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

    // Determine Recipient Phone Number
    // Priority 1: Explicitly passed in body
    let targetPhone = bodyPhone;

    // Priority 2: Use Conversation's Channel ID (Primary source of truth for WA)
    if (!targetPhone) {
      if (conversation.channelId && /^\d+$/.test(conversation.channelId)) {
        targetPhone = conversation.channelId;
      }
      // Priority 3: Check Ticket Creator (if it was a ticket)
      else {
        // If this conversation is linked to a ticket, maybe the ticket has contact info?
        const linkedTicket = await prisma.ticket.findFirst({
          where: { conversationId: conversation.id },
          include: { createdBy: true },
        });

        // If the creator looks like a phone number (legacy setup)
        if (linkedTicket?.createdBy?.email?.includes("@whatsapp.user")) {
          const potentialPhone = linkedTicket.createdBy.email.split("@")[0];
          if (/^\d+$/.test(potentialPhone)) {
            targetPhone = potentialPhone;
          }
        }
      }
    }

    // Validation
    if (!targetPhone) {
      console.error(
        `[ReplyController] ❌ FAILED to resolve phone number for ConvID: ${conversation.id}`
      );
      throw new AppError(
        "CRITICAL: Cannot determine recipient phone number from Database. Conversation ChannelID is missing or invalid.",
        400
      );
    }

    // Clean phone (Allow full JIDs if passed, otherwise strip non-digits)
    targetPhone = targetPhone.includes("@")
      ? targetPhone
      : targetPhone.replace(/[^\d]/g, "");

    // Final Gate Check
    if (targetPhone.length < 5) {
      throw new AppError("Resolved phone number is too short/invalid", 400);
    }

    // REMOVED "GHOST NUMBER" BLOCKING logic here to allow LIDs.
    // LIDs are now valid destinations (`whatsapp.service` handles routing).

    const messageContent =
      content ||
      (attachment
        ? attachment.type === "image"
          ? "📷 Imagen"
          : `📎 Archivo: ${attachment.name || "Adjunto"}`
        : "");

    console.log(`[Reply] ✅ Resolved target phone: ${targetPhone}`);

    // 🚀 CENTRALIZED SENDING (Service Handles DB + Socket)
    let message;
    const isScheduled = req.body.scheduledAt;

    if (isScheduled) {
      // --- SCHEDULED MESSAGE FLOW ---
      console.log(`[Reply] 🕒 Scheduling message for ${req.body.scheduledAt}`);

      message = await prisma.message.create({
        data: {
          content: messageContent,
          channel: channel as any,
          direction: "OUTBOUND",
          conversationId: conversation.id,
          senderId: req.user.id,
          status: "SCHEDULED",
          metadata: {
            scheduledAt: req.body.scheduledAt,
            attachment: attachment || undefined,
          },
        },
        include: { sender: true },
      });
    } else if (channel === "WHATSAPP") {
      // --- IMMEDIATE SEND FLOW ---
      try {
        console.log(
          "🚀 [Reply] Calling whatsappService.sendMessage with attachment:",
          {
            type: attachment?.type,
            hasUrl: !!attachment?.url,
            urlLength: attachment?.url?.length,
          }
        );

        message = await whatsappService.sendMessage(
          targetPhone,
          messageContent,
          {
            companyId: req.companyId,
            conversationId: conversation.id,
            senderId: req.user.id,
            media: attachment,
          }
        );
      } catch (error: any) {
        console.error("❌ [Reply] Failed to send WhatsApp message:");
        console.error("Error message:", error?.message);
        console.error("Error stack:", error?.stack);
        console.error("Full error:", JSON.stringify(error, null, 2));
        throw new AppError(
          `Failed to send message via WhatsApp: ${error?.message}`,
          502
        );
      }
    } else {
      // Fallback for other channels (not implemented fully yet, but keep logic safe)
      message = await prisma.message.create({
        data: {
          content: messageContent,
          channel: channel as any,
          direction: "OUTBOUND",
          conversationId: conversation.id,
          senderId: req.user.id,
        },
        include: { sender: true },
      });
    }

    res.status(201).json({
      status: "success",
      data: { message },
    });
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
