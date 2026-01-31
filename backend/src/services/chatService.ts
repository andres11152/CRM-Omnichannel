import { prisma } from "@/config/database";
import { ConversationStatus, Prisma } from "@prisma/client";
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
    // 1. Upsert System User (Authentication/Chat Identity)
    const user = await prisma.user.upsert({
      where: { email: params.email },
      update: {
        ...(params.name && { name: params.name }),
        ...(params.phone && { phone: params.phone }),
        updatedAt: new Date(),
      },
      create: {
        email: params.email,
        name: params.name,
        password: "$2a$10$DummyHashForWhatsAppUser",
        role: params.role || "USER",
        companyId: params.companyId,
        phone: params.phone,
      },
    });

    // 2. 100-YEAR FIX: Sync with CRM Contact Module
    // Only sync valid "USER" roles (customers) not groups.
    // UPDATE: Allow LIDs to sync. If we don't have a phone, we still create the contact
    // so the agent can rename it manually in CRM. We prioritize capturing the interaction.

    if (user.role === "USER" && !params.email.includes("@g.us")) {
      try {
        await contactService.upsert(params.companyId, {
          // If we have a real phone, use it. If not (LID), leave phone empty.
          phone: params.phone || undefined,
          // 🛡️ 100-YEAR FIX: Pass the email as-is.
          // contactService.upsert now handles internal email logic correctly:
          // - If phone is available, it will discard internal emails
          // - If phone is NOT available (LID), it will keep the email as identifier
          email: params.email,
          name: params.name, // Will be the LID if no pushname, but user can edit it.
          customFields: {
            source: "whatsapp",
            whatsappId: params.email.split("@")[0], // This is the LID or Phone ID
            userId: user.id,
          },
          tags: ["Importado de Chat"],
        });
      } catch (error) {
        // CRM Sync should be non-blocking. Log and continue.
        console.warn(
          `[ChatService] Failed to sync CRM contact for ${params.email}`,
          error,
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
