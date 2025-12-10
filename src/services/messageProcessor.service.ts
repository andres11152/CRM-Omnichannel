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

    // 1. Find or Create CUSTOMER User
    let customerUser = await prisma.user.findFirst({
      where: {
        email: `${phone}@whatsapp.user`,
        companyId: companyId,
      },
    });

    if (!customerUser) {
      customerUser = await prisma.user.create({
        data: {
          email: `${phone}@whatsapp.user`,
          name: contactName || phone, // Use pushName if available
          password: await bcrypt.hash("123456", 10),
          role: "USER",
          companyId: companyId,
        },
      });
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
    console.log(
      `[MessageProcessor] Looking for conversation: phone=${phone}, customerId=${customerUser.id}`
    );

    // 1. Try to find an OPEN conversation for this contact by participant OR phone
    let conversation = await prisma.conversation.findFirst({
      where: {
        companyId: companyId,
        status: "OPEN",
        OR: [
          { participants: { some: { id: customerUser.id } } },
          { channelId: phone }, // Also search by phone number
        ],
      },
    });

    if (conversation) {
      console.log(
        `[MessageProcessor] Found OPEN conversation: ${conversation.id}, channelId=${conversation.channelId}`
      );
    }

    // 2. If no OPEN conversation, check for ANY conversation (legacy fallback)
    if (!conversation) {
      console.log(
        `[MessageProcessor] No OPEN conversation found, searching for ANY conversation...`
      );
      conversation = await prisma.conversation.findFirst({
        where: {
          companyId: companyId,
          OR: [
            { participants: { some: { id: customerUser.id } } },
            { channelId: phone }, // Also search by phone number
          ],
        },
        orderBy: { updatedAt: "desc" },
      });

      if (conversation) {
        console.log(
          `[MessageProcessor] Found closed conversation: ${conversation.id}, status=${conversation.status}, reopening...`
        );
      }

      // Reuse if found and reopen it
      if (conversation && conversation.status !== "OPEN") {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: "OPEN" },
        });
        conversation.status = "OPEN";
        console.log(
          `[MessageProcessor] Conversation ${conversation.id} reopened`
        );
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

          // 4. Assign to the least busy
          assignedToId = agentCounts[0].id;
          console.log(
            `[Round Robin] Assigned to ${assignedToId} (Load: ${agentCounts[0].count})`
          );
        }
      } catch (err) {
        console.error(
          "[Round Robin] Assignment failed, leaving unassigned:",
          err
        );
      }

      console.log(
        `[MessageProcessor] Creating NEW conversation for phone=${phone}, customer=${customerUser.email}`
      );
      conversation = await prisma.conversation.create({
        data: {
          companyId: companyId,
          channelId: phone, // Use phone number, NOT sessionId
          subject: `WhatsApp: ${dbSenderName}`,
          status: "OPEN",
          assignedToId, // Assign the agent
          participants: { connect: [{ id: customerUser.id }] },
        },
      });
      console.log(
        `[MessageProcessor] Created conversation ${conversation.id} with channelId=${conversation.channelId}`
      );
    } else {
      // Ensure channelId is set to phone number (not sessionId)
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

    // Emit Socket Event
    const io = gateway.getIO();

    if (!io) {
      console.error("[MessageProcessor] CRITICAL: Socket.io instance is NULL!");
    } else {
      console.log(
        `[MessageProcessor] Socket.io active. Clients: ${
          (io as any).engine?.clientsCount || 0
        }`
      );
    }

    const socketPayload = {
      ...newMessage,
      ticketId: conversation.id, // Frontend uses ticketId alias
      senderName: dbSenderName,
      senderType: dbSenderType,
    };

    console.log(
      `[MessageProcessor] Emitting message to company: ${companyId}, ticketId: ${conversation.id}`
    );
    io?.to(companyId).emit("message", socketPayload); // Broadcast to company room
    io?.emit("message", socketPayload); // Legacy global broadcast (for safety)
    console.log(`[MessageProcessor] Message emitted successfully`);

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
          // We need to send the message back via WhatsApp Service
          // This is a circle dependency risk if we import whatsappService directly
          // Solution: Use dynamic import or pass a callback. For now dynamic import.
          const { whatsappService } = await import("./whatsapp.service");

          await whatsappService.sendMessage(
            "unknown", // RemoteJid is tricky here unless queried from conversation participants
            aiResponse,
            channelId
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
