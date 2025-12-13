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
      } else if (!isOutbound) {
        // CREATE NEW CONTACT (Only on Inbound)
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
      let conversation = await prisma.conversation.findFirst({
        where: { companyId, channelId: phone },
      });

      if (!conversation) {
        // CREATE NEW CONVERSATION & TICKET
        await prisma.$transaction(async (tx) => {
          conversation = await tx.conversation.create({
            data: {
              companyId,
              channelId: phone,
              subject: displayName,
              status: "OPEN",
              participants: { connect: [{ id: user!.id }] },
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
            },
          });
        });
      } else {
        // 4b. UPDATE CONVERSATION METADATA (Only for Inbound)
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

      // 6. SAVE MESSAGE (With Deduplication for Outbound)
      if (isOutbound) {
        const recentMessage = await prisma.message.findFirst({
          where: {
            conversationId: conversation.id,
            direction: MessageDirection.OUTBOUND,
            createdAt: { gt: new Date(Date.now() - 10000) }, // Last 10 seconds
            content: text,
          },
        });

        if (recentMessage) {
          console.log(
            `[MsgProcessor] 🛑 Skipping Duplicate Outbound Message (ID: ${recentMessage.id})`
          );
          return;
        }
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
    } catch (error) {
      console.error(`[MsgProcessor] 🛑 Fatal Error:`, error);
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
