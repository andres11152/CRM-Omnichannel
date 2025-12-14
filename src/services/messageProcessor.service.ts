import { prisma } from "@/config/prisma";
import { gateway } from "@/gateways/socketGateway";
import { Prisma, MessageDirection, Channel, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * 🛡️ TYPE DEFINITIONS (Strict & Scalable)
 */
interface IncomingMessagePayload {
  companyId: string;
  sessionId: string;
  remoteJid: string; // Raw Phone number or JID
  text: string;
  isOutbound: boolean;
  contactName?: string;
  senderName?: string;
  hasMedia?: boolean;
  media?: {
    url: string;
    type: string; // "image", "video", "document", "audio"
    mimetype?: string;
    caption?: string;
  };
  profilePicUrl?: string; // WhatsApp Profile Picture URL
  about?: string; // WhatsApp Status/About
}

/**
 * 🛡️ BLACKLIST FOR GENERIC NAMES
 * Centralized list of names we NEVER want to save in the DB.
 */
const INVALID_NAMES_REGEX =
  /^(unknown( contact)?|usuario( de)? whatsapp|sin nombre|whatsapp user)$/i;

/**
 * 🧠 UTILITY: JID Normalizer
 * Converts messy JIDs (12345:11@s.whatsapp.net) into clean ints (12345)
 */
const normalizeJid = (jid: string): string | null => {
  if (!jid) return null;

  // 1. Remove domain and artifacts
  let clean = jid.split("@")[0].split(":")[0];

  // 2. Keep only digits
  clean = clean.replace(/\D/g, "");

  // 3. Filter Technical/Ghost LIDs (critical for Baileys)
  if (
    clean.length > 15 ||
    clean.startsWith("459") ||
    clean.startsWith("252") ||
    clean.length < 7
  ) {
    console.warn(`[JID Normalizer] 👻 Blocking Ghost/LID Number: ${clean}`);
    return null;
  }

  return clean;
};

/**
 * 🧠 UTILITY: Name Sanitizer
 * Returns a valid name or NULL if the name is garbage.
 */
const sanitizeName = (
  rawName: string | undefined,
  phone: string
): string | null => {
  if (!rawName) return null;
  const trimmed = rawName.trim();
  if (trimmed === "" || INVALID_NAMES_REGEX.test(trimmed)) return null;
  return trimmed;
};

export const messageProcessor = {
  /**
   * 🚀 ENTRY POINT
   * Handles concurrency locally. For SaaS Scale, move this to BullMQ.
   */
  async process(payload: IncomingMessagePayload) {
    const { remoteJid, companyId } = payload;

    const phone = normalizeJid(remoteJid);
    if (!phone) return; // Skip invalid JIDs silently

    const sanitizedPayload = { ...payload, remoteJid: phone };
    await this._processSafe(sanitizedPayload);
  },

  /**
   * 🔒 CORE LOGIC
   * Uses Transactions and Atomic operations where possible.
   */
  async _processSafe(payload: IncomingMessagePayload) {
    try {
      const {
        companyId,
        remoteJid: phone,
        text,
        isOutbound,
        media,
        hasMedia,
      } = payload;

      console.log(
        `[MsgProcessor] ⚡ Processing ${
          isOutbound ? "OUT" : "IN"
        } | Phone: ${phone}`
      );

      // 1. DETERMINE DISPLAY NAME (The "Truth")
      const rawContactName = payload.contactName || payload.senderName;
      const cleanContactName = sanitizeName(rawContactName, phone);

      let displayName = cleanContactName || phone;

      // 2. GET OR CREATE CONTACT (Atomic-ish)
      let contact = await prisma.contact.findFirst({
        where: { companyId, phone },
      });

      if (contact) {
        // UPDATE EXISTING: Only if we have a BETTER name and !isOutbound
        const currentNameIsGeneric =
          contact.name === phone || INVALID_NAMES_REGEX.test(contact.name);

        if (!isOutbound && cleanContactName && currentNameIsGeneric) {
          console.log(
            `[MsgProcessor] ♻️ Upgrading Name: ${contact.name} -> ${cleanContactName}`
          );
          contact = await prisma.contact.update({
            where: { id: contact.id },
            data: { name: cleanContactName },
          });
          displayName = cleanContactName;
        } else {
          // Keep existing robust name
          displayName = contact.name;
        }
      } else {
        // CREATE NEW CONTACT (Outbound or Inbound)
        // If we write to a new number, we MUST create the contact so the chat exists.
        console.log(`[MsgProcessor] 👤 Creating Contact: ${displayName}`);
        contact = await prisma.contact.create({
          data: {
            companyId,
            phone,
            name: displayName,
            tags: ["WHATSAPP_LEAD"],
          },
        });
      }

      // 3. GET OR CREATE USER (Atomic Upsert)
      const userEmail = `${phone}@whatsapp.user`;
      const dummyPassword = await bcrypt.hash(phone, 10);

      // PREPARE UPDATE DATA: Protect Name on Outbound
      const userUpdateData: any = { phone };
      if (!isOutbound) {
        userUpdateData.name = displayName;
        // Update profile info if available
        if (payload.profilePicUrl)
          userUpdateData.profilePicUrl = payload.profilePicUrl;
        if (payload.about) userUpdateData.about = payload.about;
      }

      let user = await prisma.user.upsert({
        where: { email: userEmail },
        update: userUpdateData,
        create: {
          companyId,
          email: userEmail,
          name: displayName,
          phone: phone,
          role: UserRole.USER,
          password: dummyPassword,
          profilePicUrl: payload.profilePicUrl,
          about: payload.about,
        },
      });

      // 4. FIND OR CREATE CONVERSATION
      // 🔑 DEFINITIVE FIX: Search by PHONE NUMBER, not user.id
      // Same contact can have multiple user records (different JIDs)
      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId,
          OR: [
            { channelId: phone },
            { participants: { some: { phone: phone } } },
            { participants: { some: { email: `${phone}@whatsapp.user` } } },
          ],
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!conversation) {
        // CREATE NEW CONVERSATION & TICKET
        await prisma.$transaction(async (tx) => {
          // 🎯 SMART QUEUE ASSIGNMENT
          // Priority: 1) Queues with AI, 2) Oldest active queue
          const assignedQueue = await tx.queue.findFirst({
            where: {
              companyId,
              isActive: true,
            },
            include: {
              aiAssistant: true,
            },
            orderBy: [
              { aiAssistantId: { sort: "desc", nulls: "last" } }, // AI queues first
              { createdAt: "asc" }, // Then oldest
            ],
          });

          const queueId = assignedQueue?.id || null;

          if (assignedQueue) {
            console.log(
              `[MsgProcessor] 🎯 Assigned to: "${assignedQueue.name}" (AI: ${
                assignedQueue.aiAssistant ? "YES" : "NO"
              })`
            );
          } else {
            console.log(`[MsgProcessor] ⚠️ No active queue found`);
          }

          conversation = await tx.conversation.create({
            data: {
              companyId,
              channelId: phone,
              subject: displayName,
              status: "OPEN",
              participants: { connect: [{ id: user!.id }] },
              queueId: queueId, // 🔥 CONFIGURABLE ASSIGNMENT!
            },
          });

          // Create Ticket
          const lastTicket = await tx.ticket.findFirst({
            where: { companyId },
            orderBy: { ticketNumber: "desc" },
          });
          const nextNum = (lastTicket?.ticketNumber || 0) + 1;

          await tx.ticket.create({
            data: {
              companyId,
              ticketNumber: nextNum,
              subject: displayName,
              description: "Chat iniciado en WhatsApp",
              status: "OPEN",
              priority: "MEDIUM",
              createdById: user!.id,
              conversationId: conversation.id,
              queueId: queueId, // Assign ticket to same queue
            },
          });
        });
      } else {
        // 4b. UPDATE CONVERSATION METADATA
        // 🔄 Update channelId if it changed (phone vs LID format)
        if (conversation.channelId !== phone) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { channelId: phone },
          });
          console.log(
            `[MsgProcessor] 🔄 Updated channelId: ${conversation.channelId} → ${phone}`
          );
        }

        // Update subject only for inbound with valid names
        if (!isOutbound) {
          const currentSubjectIsGeneric =
            conversation.subject === phone ||
            INVALID_NAMES_REGEX.test(conversation.subject);
          if (
            cleanContactName &&
            conversation.subject !== cleanContactName &&
            currentSubjectIsGeneric
          ) {
            await prisma.conversation.update({
              where: { id: conversation!.id },
              data: { subject: cleanContactName },
            });
          }
          if (conversation.status !== "OPEN") {
            await prisma.conversation.update({
              where: { id: conversation!.id },
              data: { status: "OPEN" },
            });
          }
        }
      }

      if (!conversation)
        throw new Error("Conversation creation failed silently");

      // 5. DETERMINE SENDER ID
      let senderId = user.id;
      if (isOutbound) {
        const admin = await prisma.user.findFirst({
          where: { companyId, role: { in: [UserRole.ADMIN, UserRole.MASTER] } },
        });
        if (admin) senderId = admin.id;
      }

      // 6. SAVE MESSAGE (With Deduplication for ALL messages)
      // Check for duplicate messages in the last 10 seconds
      const recentMessage = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          direction: isOutbound
            ? MessageDirection.OUTBOUND
            : MessageDirection.INBOUND,
          createdAt: { gt: new Date(Date.now() - 10000) }, // Last 10 seconds
          content: text,
        },
      });

      if (recentMessage) {
        console.log(
          `[MsgProcessor] 🛑 Skipping Duplicate ${
            isOutbound ? "Outbound" : "Inbound"
          } Message (ID: ${recentMessage.id})`
        );
        return;
      }

      const newMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channel: Channel.WHATSAPP,
          direction: isOutbound
            ? MessageDirection.OUTBOUND
            : MessageDirection.INBOUND,
          content: text,
          senderId: senderId,
          metadata: hasMedia ? { media } : undefined,
        },
        include: { sender: true },
      });

      // 7. EMIT REAL-TIME EVENTS
      this._emitSocketEvents(
        conversation,
        newMessage,
        displayName,
        companyId,
        isOutbound,
        user.id,
        user // Pass full user object for profile info
      );

      // 8. 🤖 AI AUTO-RESPONSE (Non-blocking)
      if (!isOutbound) {
        console.log(
          `[AI] Checking auto-response for conversation ${conversation.id}`
        );
        setImmediate(() => {
          this._handleAIAutoResponse(
            conversation.id,
            newMessage.id,
            text,
            companyId
          ).catch((err) => {
            console.error(`[AI] Auto-response failed:`, err);
          });
        });
      }
    } catch (error) {
      console.error(`[MsgProcessor] 🛑 Fatal Error:`, error);
    }
  },

  /**
   * 🤖 AI AUTO-RESPONSE HANDLER
   * Generates and sends AI responses for conversations with AI assistants
   * @param conversationId - ID of the conversation
   * @param inboundMessageId - ID of the message to respond to (prevents loops)
   * @param userMessage - Content of the user's message
   * @param companyId - Company ID for security
   */
  async _handleAIAutoResponse(
    conversationId: string,
    inboundMessageId: string,
    userMessage: string,
    companyId: string
  ) {
    try {
      // 1. Get conversation with queue and AI assistant info
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          queue: {
            include: {
              aiAssistant: true,
            },
          },
          messages: {
            where: {
              // Exclude the message we're responding to and any newer ones
              id: { not: inboundMessageId },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { sender: true },
          },
        },
      });

      if (!conversation) {
        console.warn(`[AI] Conversation ${conversationId} not found`);
        return;
      }

      // 2. Check if conversation has AI assistant assigned via queue
      if (!conversation.queueId) {
        console.log(
          `[AI] Conversation ${conversationId} has no queue assigned. Skipping AI.`
        );
        return;
      }

      if (!conversation.queue?.aiAssistant) {
        console.log(
          `[AI] Queue "${conversation.queue?.name}" has no AI assistant. Skipping.`
        );
        return;
      }

      const aiAssistant = conversation.queue.aiAssistant;

      console.log(
        `[AI] ✓ Triggering AI: ${aiAssistant.name} (Queue: ${conversation.queue.name})`
      );

      // 3. Format conversation history for AI context
      const history = conversation.messages
        .slice()
        .reverse()
        .map((msg) => ({
          role: (msg.direction === "INBOUND" ? "user" : "model") as
            | "user"
            | "model",
          parts: msg.content,
        }));

      // 4. Generate AI response
      const { generateAIResponse } = await import("./aiResponseService");
      const aiResponseText = await generateAIResponse(
        companyId,
        aiAssistant.id,
        userMessage,
        history
      );

      if (!aiResponseText) {
        console.warn(
          `[AI] No response generated for conversation ${conversationId}`
        );
        return;
      }

      console.log(`[AI] ✓ Response generated (${aiResponseText.length} chars)`);

      // 5. Get or create bot user for this AI assistant
      const botEmail = `ai_${aiAssistant.id}@reply.bot`;
      let botUser = await prisma.user.findUnique({
        where: { email: botEmail },
      });

      if (!botUser) {
        botUser = await prisma.user.create({
          data: {
            email: botEmail,
            name: aiAssistant.name,
            password: await bcrypt.hash(aiAssistant.id, 10),
            role: "AGENT",
            companyId,
          },
        });
        console.log(`[AI] Created bot user: ${aiAssistant.name}`);
      }

      // 6. Send via WhatsApp (Handles persistence and socket emission)
      // We delegate everything to sendMessage to avoid duplication in DB/Socket
      const { whatsappService } = await import("./whatsapp.service");
      await whatsappService.sendMessage(
        conversation.channelId,
        aiResponseText,
        {
          companyId,
          conversationId,
          senderId: botUser.id,
          metadata: {
            aiGenerated: true,
            aiAssistantId: aiAssistant.id,
            aiAssistantName: aiAssistant.name,
          },
        }
      );

      console.log(`[AI] ✅ Response delegated to WhatsApp Service`);
    } catch (error) {
      console.error(`[AI] Fatal error in auto-response:`, error);
      // Don't throw - let message processing continue
    }
  },

  /**
   * 📡 SOCKET EMITTER
   */
  _emitSocketEvents(
    conversation: any,
    message: any,
    displayName: string,
    companyId: string,
    isOutbound: boolean,
    contactId: string,
    user: any // Add user parameter for profile info
  ) {
    const io = gateway.getIO();
    if (!io) return;

    // 1. Emit to Chat Room (Specific Conversation)
    io.to(conversation.id).emit("conversation.new_message", message);

    // 2. Emit to Dashboard (List Update)
    const dashboardPayload = {
      id: conversation.id,
      channel: "whatsapp",
      subject: displayName,
      lastMessage: message.content,
      lastMessageAt: message.createdAt,
      unreadCount: !isOutbound ? (conversation.unreadCount || 0) + 1 : 0, // Frontend will ignore this and calculate locally
      contact: {
        id: contactId,
        name: displayName,
        phone: conversation.channelId,
        avatarUrl: null,
        profilePicUrl: user?.profilePicUrl,
        about: user?.about,
      },
    };

    io.to(`company:${companyId}`).emit(
      "conversation.updated",
      dashboardPayload
    );
  },
};
