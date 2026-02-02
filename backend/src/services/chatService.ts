import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client";
import { contactService } from "@/services/contactService";

/**
 * 💬 CHAT SERVICE
 * Handles low-level DB persistence for conversations and messages.
 * Extracted from MessageHandler to follow SRP.
 */
export class ChatService {
  /**
   * Find a user strictly by phone number (fuzzy match last 10 digits)
   */
  async findUserByPhone(
    companyId: string,
    phone: string,
    excludeEmail?: string,
  ) {
    if (!phone) return null;
    const nationalNumber = phone.length > 10 ? phone.slice(-10) : phone;

    return prisma.user.findFirst({
      where: {
        companyId,
        OR: [{ phone: phone }, { phone: { endsWith: nationalNumber } }],
        ...(excludeEmail ? { NOT: { email: excludeEmail } } : {}),
      },
    });
  }

  /**
   * Find user by Name (LID strategy)
   */
  async findUserByName(companyId: string, name: string) {
    return prisma.user.findFirst({
      where: {
        companyId,
        name: name,
        email: { endsWith: "@whatsapp.user" },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Create or Update a WhatsApp "Shadow" User & Sync with CRM Contact
   */
  async upsertWhatsAppUser(params: {
    email: string;
    name: string;
    companyId: string;
    phone?: string | null;
    role?: "USER" | "AGENT" | "ADMIN" | "MASTER";
  }) {
    // 0. 🛡️ 100-YEAR FIX: Name Preservation Logic
    // Prevent overwriting a real name (e.g. "Juan Perez") with a phone-number-name (e.g. "+57300...")
    // which happens when WhatsApp messages arrive without a pushName.

    let nameToPersist = params.name;
    const existingUser = await prisma.user.findUnique({
      where: { email: params.email },
      select: { name: true },
    });

    if (existingUser) {
      const isNewNamePhone = /^\+?\d[\d\s-]*$/.test(params.name);
      const isOldNamePhone = /^\+?\d[\d\s-]*$/.test(existingUser.name);

      // If new name is just a phone number, but we already have a real name, KEEP the real name.
      if (isNewNamePhone && !isOldNamePhone) {
        nameToPersist = existingUser.name;
      }
    }

    // 1. Upsert System User (Authentication/Chat Identity)
    const user = await prisma.user.upsert({
      where: { email: params.email },
      update: {
        name: nameToPersist,
        ...(params.phone && { phone: params.phone }),
        updatedAt: new Date(),
      },
      create: {
        email: params.email,
        name: nameToPersist,
        password: "$2a$10$DummyHashForWhatsAppUser",
        role: params.role || "USER",
        companyId: params.companyId,
        phone: params.phone,
      },
    });

    // 2. 🛡️ 100-YEAR ENTERPRISE FIX: CRM Contact Sync with Real Phone Validation
    // Requirements:
    //   1. ONLY sync USER roles (customers), never groups
    //   2. ONLY sync if we have a REAL phone number (not LID, not fake)
    //   3. NEVER create garbage contacts that pollute the CRM
    //
    // If phone is null/undefined, the contact had a LID that couldn't be resolved.
    // In that case, we DO NOT create a CRM contact (it would be useless).

    const isGroup = params.email.includes("@g.us");
    const hasRealPhone =
      params.phone && params.phone.length >= 7 && params.phone.length <= 15;

    if (user.role === "USER" && !isGroup && hasRealPhone) {
      try {
        await contactService.upsert(params.companyId, {
          phone: params.phone,
          // 🛡️ Use the Persisted Name (which preserves history), not the raw param
          name: user.name,
          email: null,
          customFields: {
            source: "whatsapp",
            whatsappId: params.email.split("@")[0],
            userId: user.id,
          },
          tags: ["Importado de Chat"],
        });
        console.info(
          `[ChatService] ✅ CRM Contact synced for real phone: ${params.phone}`,
        );
      } catch (error) {
        // CRM Sync should be non-blocking. Log and continue.
        console.warn(
          `[ChatService] Failed to sync CRM contact for ${params.email}`,
          error,
        );
      }
    } else {
      // Log why we skipped CRM sync
      if (isGroup) {
        console.info(`[ChatService] ⏩ Skipped CRM sync: Group chat`);
      } else if (!hasRealPhone) {
        console.info(
          `[ChatService] ⏩ Skipped CRM sync: No real phone (LID or invalid)`,
        );
      }
    }

    return user;
  }

  /**
   * Find existing conversation
   */
  async findConversation(
    companyId: string,
    channelId: string,
    userEmail: string,
  ) {
    return prisma.conversation.findFirst({
      where: {
        OR: [
          { companyId, channelId },
          { companyId, participants: { some: { email: userEmail } } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Find CRM Contact by Phone (Helper for MessageHandler)
   */
  async findContact(companyId: string, phone: string) {
    return prisma.contact.findFirst({
      where: { companyId, phone, deletedAt: null },
    });
  }

  /**
   * Create new conversation (Atomic)
   * 🛡️ 100-YEAR FIX: Now supports Group chats with metadata
   */
  async createConversation(data: {
    companyId: string;
    channelId: string;
    subject: string;
    userId?: string;
    isGroup?: boolean;
    groupMetadata?: {
      groupName?: string;
      description?: string;
      participantCount?: number;
      groupPicUrl?: string | null;
    };
  }) {
    return prisma.conversation.create({
      data: {
        companyId: data.companyId,
        channelId: data.channelId,
        subject: data.subject,
        status: "OPEN",
        isGroup: data.isGroup ?? false,
        groupMetadata: data.groupMetadata ?? undefined,
        participants: data.userId
          ? { connect: [{ id: data.userId }] }
          : undefined,
      },
    });
  }

  /**
   * Update conversation status/timestamp
   */
  async updateConversation(
    id: string,
    updates: Prisma.ConversationUncheckedUpdateInput,
  ) {
    return prisma.conversation.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Find Ghost Conversation (for merging)
   */
  async findGhostConversation(companyId: string) {
    return prisma.conversation.findFirst({
      where: {
        companyId,
        updatedAt: { gt: new Date(Date.now() - 45000) },
        participants: {
          some: { phone: null, email: { endsWith: "@whatsapp.user" } },
        },
      },
      include: { participants: true },
    });
  }

  async migrateConversationHistory(
    conversationId: string,
    oldUserId: string,
    newUserId: string,
  ) {
    await prisma.message.updateMany({
      where: { conversationId, senderId: oldUserId },
      data: { senderId: newUserId },
    });
    // Update participants
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        participants: {
          disconnect: { id: oldUserId },
          connect: { id: newUserId },
        },
      },
    });
  }

  async doesMessageExist(whatsappMessageId: string) {
    const exists = await prisma.message.findUnique({
      where: { whatsappMessageId },
      select: { id: true },
    });
    return !!exists;
  }

  /**
   * Persist Message
   */
  async upsertMessage(data: {
    whatsappMessageId: string;
    companyId: string;
    content: string;
    direction: "INBOUND" | "OUTBOUND";
    conversationId: string;
    senderId: string;
    status: "SENT" | "DELIVERED";
    metadata: Prisma.InputJsonValue;
    createdAt?: Date;
  }) {
    return prisma.message.upsert({
      where: { whatsappMessageId: data.whatsappMessageId },
      create: {
        companyId: data.companyId,
        content: data.content,
        channel: "WHATSAPP",
        direction: data.direction,
        conversationId: data.conversationId,
        senderId: data.senderId,
        status: data.status,
        whatsappMessageId: data.whatsappMessageId,
        metadata: data.metadata,
        ...(data.createdAt && { createdAt: data.createdAt }),
      },
      update: {}, // Immutable
      include: { sender: true },
    });
  }

  /**
   * Fetch Full Conversation Context for Events
   */
  async getFullConversation(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        assignedTo: true,
        queue: { include: { aiAssistant: true } },
      },
    });
  }

  // --- Ticket Methods ---

  async ensureTicket(
    companyId: string,
    conversationId: string,
    customerId: string,
    subject: string,
    description: string,
  ) {
    let ticket = await prisma.ticket.findFirst({
      where: {
        companyId,
        conversationId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });

    if (!ticket) {
      const lastTicket = await prisma.ticket.findFirst({
        where: { companyId },
        orderBy: { ticketNumber: "desc" },
        select: { ticketNumber: true },
      });
      const nextNum = (lastTicket?.ticketNumber || 0) + 1;

      ticket = await prisma.ticket.create({
        data: {
          ticketNumber: nextNum,
          subject,
          description: description.substring(0, 100),
          status: "OPEN",
          priority: "MEDIUM",
          companyId,
          createdById: customerId,
          conversationId,
        },
      });
    }
    return ticket;
  }

  /**
   * Update message status (DELIVERED, READ, FAILED)
   */
  async updateMessageStatus(whatsappMessageId: string, status: string) {
    return prisma.message.update({
      where: { whatsappMessageId },
      data: { status },
    });
  }
}

export const chatService = new ChatService();
