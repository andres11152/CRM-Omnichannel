import { prisma } from "@/config/prisma";
import { gateway } from "@/gateways/socketGateway"; // Import gateway directly
import bcrypt from "bcryptjs";

interface IncomingMessagePayload {
  companyId: string;
  sessionId: string; // channelId
  remoteJid: string; // Phone number
  text: string;
  isOutbound: boolean;
  contactName?: string;
  senderName?: string; // For outbound agents
  hasMedia?: boolean;
  media?: {
    url: string;
    type: string; // "image", "video", "document", "audio"
    mimetype?: string;
    caption?: string;
  };
}

/**
 * MESSAGE PROCESSOR SERVICE
 * Centralizes logic for processing incoming messages from ANY source
 * (Baileys, WhatsApp Cloud API, External Webhooks)
 */

// Lock to prevent creating multiple conversations for same number simultaneously
const conversationLocks = new Map<string, Promise<any>>();

export const messageProcessor = {
  async process(payload: IncomingMessagePayload) {
    const {
      companyId,
      sessionId,
      remoteJid,
      text,
      isOutbound,
      contactName = "Unknown Contact",
      senderName,
    } = payload;

    const phone = remoteJid.split("@")[0];

    // Create a lock key to prevent race conditions
    const lockKey = `${companyId}-${phone}`;

    // If there's already a process running for this phone, wait for it
    if (conversationLocks.has(lockKey)) {
      await conversationLocks.get(lockKey);
    }

    // Create a new lock promise
    const lockPromise = this._processMessage(payload);
    conversationLocks.set(lockKey, lockPromise);

    try {
      return await lockPromise;
    } finally {
      // Release lock after 2 seconds
      setTimeout(() => conversationLocks.delete(lockKey), 2000);
    }
  },

  async _processMessage(payload: IncomingMessagePayload) {
    const {
      companyId,
      sessionId,
      remoteJid,
      text,
      isOutbound,
      contactName, // This comes from msg.pushName
      senderName,
    } = payload;

    const phone = remoteJid.split("@")[0];

    // Determine best display name: pushName > phone number
    const displayName =
      contactName && contactName !== "Unknown Contact" ? contactName : phone;

    // 1. Find or Create CUSTOMER User
    let customerUser = await prisma.user.findFirst({
      where: {
        email: `${phone}@whatsapp.user`,
        companyId: companyId,
      },
    });

    if (!customerUser) {
      // Create new contact with best available name
      customerUser = await prisma.user.create({
        data: {
          email: `${phone}@whatsapp.user`,
          name: displayName,
          password: await bcrypt.hash("123456", 10),
          role: "USER",
          companyId: companyId,
        },
      });
    } else {
      // Update name if we got a better name (real name vs phone number)
      const currentNameIsGeneric =
        !customerUser.name ||
        customerUser.name === phone ||
        customerUser.name === "Unknown Contact";

      const newNameIsBetter =
        contactName &&
        contactName !== "Unknown Contact" &&
        contactName !== phone;

      if (currentNameIsGeneric && newNameIsBetter) {
        customerUser = await prisma.user.update({
          where: { id: customerUser.id },
          data: { name: contactName },
        });
      }
    }

    // Determine Sender ID
    let dbSenderId = customerUser.id;
    let dbSenderName = customerUser.name || phone;
    let dbSenderType = "USER";

    if (isOutbound) {
      // If message is from ME (Mobile), assign to a "Mobile Agent" user
      const mobileEmail = `mobile_${companyId}@reply.com`;
      let mobileUser = await prisma.user.findUnique({
        where: { email: mobileEmail },
      });

      if (!mobileUser) {
        mobileUser = await prisma.user.create({
          data: {
            email: mobileEmail,
            name: senderName || "Desde Celular",
            password: await bcrypt.hash("123456", 10),
            role: "AGENT",
            companyId: companyId,
          },
        });
      }
      dbSenderId = mobileUser.id;
      dbSenderName = mobileUser.name || "Agente";
      dbSenderType = "AGENT";
    }

    // Find or Create Conversation
    const cleanPhone = phone.replace(/[^\d]/g, "");

    let conversation = await prisma.conversation.findFirst({
      where: {
        companyId: companyId,
        status: "OPEN",
        OR: [
          { participants: { some: { id: customerUser.id } } },
          { channelId: { contains: cleanPhone } }, // Search by phone (flexible)
          { channelId: phone }, // Exact match as backup
        ],
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.findFirst({
        where: {
          companyId: companyId,
          OR: [
            { participants: { some: { id: customerUser.id } } },
            { channelId: { contains: cleanPhone } },
            { channelId: phone },
          ],
        },
        orderBy: { updatedAt: "desc" },
      });

      if (conversation && conversation.status !== "OPEN") {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: "OPEN" },
        });
        conversation.status = "OPEN";
      }
    }

    if (!conversation) {
      // --- ROUND ROBIN ASSIGNMENT (Least Busy) ---
      let assignedToId = null;
      try {
        // 1. Get all agents
        const agents = await prisma.user.findMany({
          where: {
            companyId,
            role: { in: ["AGENT", "ADMIN"] },
            email: { not: { startsWith: "bot_" } }, // Exclude bots
          },
          select: { id: true },
        });

        if (agents.length > 0) {
          // 2. Count open tickets per agent
          const counts = await prisma.conversation.groupBy({
            by: ["assignedToId"],
            where: {
              companyId,
              status: "OPEN",
              assignedToId: { in: agents.map((a) => a.id) },
            },
            _count: { assignedToId: true },
          });

          // 3. Sort by workload (Ascending)
          const agentCounts = agents
            .map((agent) => ({
              id: agent.id,
              count:
                counts.find((c) => c.assignedToId === agent.id)?._count
                  .assignedToId || 0,
            }))
            .sort((a, b) => a.count - b.count);

          assignedToId = agentCounts[0].id;
        }
      } catch (err) {
        console.error(
          "[Round Robin] Assignment failed, leaving unassigned:",
          err
        );
      }

      conversation = await prisma.conversation.create({
        data: {
          companyId: companyId,
          channelId: phone,
          subject: `WhatsApp: ${dbSenderName}`,
          status: "OPEN",
          assignedToId,
          participants: { connect: [{ id: customerUser.id }] },
        },
      });
    } else {
      if (
        !conversation.channelId ||
        conversation.channelId.startsWith("session_")
      ) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { channelId: phone },
        });
        conversation.channelId = phone;
      }
    }

    // Create Message
    const newMessage = await prisma.message.create({
      data: {
        content: text,
        channel: "WHATSAPP",
        direction: isOutbound ? "OUTBOUND" : "INBOUND",
        conversationId: conversation.id,
        senderId: dbSenderId,
        metadata: payload.media ? { attachment: payload.media } : undefined,
      },
    });

    const io = gateway.getIO();

    const socketPayload = {
      ...newMessage,
      ticketId: conversation.id, // Frontend uses ticketId alias
      senderName: dbSenderName,
      senderType: dbSenderType,
      // Extract attachment from metadata for frontend compatibility
      attachment: (newMessage.metadata as any)?.attachment || undefined,
    };

    console.log(`[MessageProcessor] 🚀 Emitting message in real-time:`, {
      conversationId: conversation.id,
      messageId: newMessage.id,
      direction: newMessage.direction,
      ioExists: !!io,
      rooms: [
        conversation.id,
        customerUser.id,
        conversation.channelId,
        companyId,
      ],
    });

    if (!io) {
      console.error(
        "[MessageProcessor] ❌ Socket.IO not initialized! Messages will not be delivered in real-time."
      );
    } else {
      io.to(conversation.id).emit("message", socketPayload);
      io.to(customerUser.id).emit("message", socketPayload);
      if (conversation.channelId) {
        io.to(conversation.channelId).emit("message", socketPayload);
      }
      io.to(companyId).emit("message", socketPayload);
      io.emit("message", socketPayload); // Global broadcast as fallback
      console.log(
        `[MessageProcessor] ✅ Message emitted to all rooms successfully`
      );
    }

    // --- SYNC QUEUE ID FALLBACK ---
    if (!conversation.queueId) {
      const ticket = await prisma.ticket.findFirst({
        where: { conversationId: conversation.id, status: "OPEN" },
        orderBy: { createdAt: "desc" },
      });
      if (ticket && ticket.queueId) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { queueId: ticket.queueId },
        });
        conversation.queueId = ticket.queueId;
      }
    }

    // --- AI AUTO-RESPONSE ---
    // Make sure we pass the conversation with queueId updated if needed
    if (conversation.queueId && !isOutbound) {
      await this.handleAIResponse(
        companyId,
        conversation.id,
        conversation.queueId,
        text,
        conversation.channelId || undefined
      );
    }
  },

  async handleAIResponse(
    companyId: string,
    conversationId: string,
    queueId: string,
    userText: string,
    channelId?: string
  ) {
    try {
      const queue = await prisma.queue.findUnique({
        where: { id: queueId },
        include: { aiAssistant: true },
      });

      if (queue?.aiAssistant) {
        // --- ANTI-LOOP PROTECTION ---
        // Check if the last message was already sent by a bot or agent to prevent loops
        const lastMessage = await prisma.message.findFirst({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          include: { sender: true },
        });

        // Loop condition: Last sender was a BOT or AGENT (and not the user)
        // We only want to reply if the last message was INBOUND (from USER)
        if (
          lastMessage?.direction === "OUTBOUND" ||
          lastMessage?.sender?.role === "AGENT"
        ) {
          console.warn(
            `[AI] Skipping response. Last message was OUTBOUND/AGENT (${lastMessage?.sender?.name}) to avoid loops.`
          );
          return;
        }
        // -----------------------------

        // Get history
        const historyMessages = await prisma.message.findMany({
          where: { conversationId: conversationId },
          orderBy: { createdAt: "desc" },
          take: 10,
          skip: 1,
        });

        // Hacky import to avoid circular dependency
        const { generateAIResponse } = await import("./aiResponseService");

        const history = historyMessages.reverse().map((m: any) => ({
          role: (m.senderId === m.sender?.companyId ? "model" : "user") as
            | "user"
            | "model", // Simplified check
          parts: m.content,
        }));

        const aiResponse = await generateAIResponse(
          companyId,
          queue.aiAssistant.id,
          userText,
          history
        );

        if (aiResponse) {
          // --- KILL SWITCH: Block known error loops ---
          if (
            aiResponse.includes("Lo siento, no puedo procesar tu solicitud") ||
            aiResponse.includes("Error interno")
          ) {
            console.warn(
              `[AI] BLOCKED RECURSIVE ERROR MESSAGE: "${aiResponse}"`
            );
            return;
          }

          // We need to send the message back via WhatsApp Service
          // This is a circle dependency risk if we import whatsappService directly
          // Solution: Use dynamic import or pass a callback. For now dynamic import.
          const { whatsappService } = await import("./whatsapp.service");

          await whatsappService.sendMessage(
            channelId || "unknown",
            aiResponse,
            { companyId }
          );

          // Create Bot User & Message
          let botSender = await prisma.user.findFirst({
            where: { email: `bot_${companyId}@reply.com` },
          });

          if (!botSender) {
            botSender = await prisma.user.create({
              data: {
                email: `bot_${companyId}@reply.com`,
                name: queue.aiAssistant.name || "AI Assistant",
                password: "bot",
                role: "AGENT",
                companyId,
              },
            });
          }

          const responseMsg = await prisma.message.create({
            data: {
              content: aiResponse,
              channel: "WHATSAPP",
              direction: "OUTBOUND",
              conversationId: conversationId,
              senderId: botSender.id,
            },
          });

          const io = gateway.getIO();
          io?.emit("message", {
            ...responseMsg,
            ticketId: conversationId,
            senderName: botSender.name,
            senderType: "BOT",
          });
        }
      }
    } catch (error) {
      console.error("[MessageProcessor] AI Error:", error);
    }
  },
};
