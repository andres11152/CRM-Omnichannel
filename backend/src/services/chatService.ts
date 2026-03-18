import { Prisma } from "@prisma/client";
import { contactService } from "@/services/contactService";
import { Logger } from "@/utils/logger";
import { userRepository } from "@/repositories/UserRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { ticketRepository } from "@/repositories/TicketRepository";
import { DistributedLock } from "@/utils/distributedLock";

/**
 * 💬 CHAT SERVICE
 * Handles low-level DB persistence for conversations and messages.
 * Extracted from MessageHandler to follow SRP.
 *
 * 🏗️ REFACTORED: All direct prisma calls replaced with repository pattern.
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

    return userRepository.findFirst({
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
    return userRepository.findFirst({
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
    let nameToPersist = params.name;
    let user;

    try {
      // 0. Name Preservation
      const existingUser = await userRepository.findFirst({
        where: { email: params.email, companyId: params.companyId },
        select: { id: true, name: true },
      });

      if (existingUser) {
        const isNewNamePhone = /^\+?\d[\d\s-]*$/.test(params.name);
        const isOldNamePhone = /^\+?\d[\d\s-]*$/.test(existingUser.name);

        if (isNewNamePhone && !isOldNamePhone) {
          nameToPersist = existingUser.name;
        }
      }

      // 1. Upsert System User (Authentication/Chat Identity)
      user = await userRepository.upsert(
        { email: params.email },
        {
          email: params.email,
          name: nameToPersist,
          password: "$2a$10$DummyHashForWhatsAppUser",
          role: params.role || "USER",
          company: { connect: { id: params.companyId } },
          phone: params.phone,
        },
        {
          name: nameToPersist,
          ...(params.phone && { phone: params.phone }),
          updatedAt: new Date(),
        },
      );
    } catch (error: unknown) {
      const isUniqueError =
        error instanceof Error &&
        error.message.includes("Unique constraint failed");

      if (isUniqueError) {
        Logger.info(
          `[ChatService] 🛡️ Race condition detected for user ${params.email}, resolving existing...`,
        );
        const existingUserAfterCollision = await userRepository.findFirst({
          where: { email: params.email, companyId: params.companyId },
        });
        if (existingUserAfterCollision) {
          user = existingUserAfterCollision;
        } else {
          // If for some reason the user is not found after a unique constraint error, rethrow.
          throw error;
        }
      } else {
        throw error;
      }
    }

    // 2. 🛡️ 100-YEAR ENTERPRISE FIX: CRM Contact Sync with Real Phone Validation
    const isGroup = params.email.includes("@g.us");
    const hasRealPhone =
      params.phone && params.phone.length >= 7 && params.phone.length <= 15;

    if (user.role === "USER" && !isGroup && hasRealPhone) {
      try {
        await contactService.upsert(params.companyId, {
          phone: params.phone,
          name: user.name,
          email: null,
          customFields: {
            source: "whatsapp",
            whatsappId: params.email.split("@")[0],
            userId: user.id,
          },
          tags: ["Importado de Chat"],
        });
        Logger.info(
          `[ChatService] ✅ CRM Contact synced for real phone: ${params.phone}`,
        );
      } catch (error) {
        Logger.warn(
          `[ChatService] Failed to sync CRM contact for ${params.email}`,
          { error },
        );
      }
    } else {
      if (isGroup) {
        Logger.info(`[ChatService] ⏩ Skipped CRM sync: Group chat`);
      } else if (!hasRealPhone) {
        Logger.info(
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
    return conversationRepository.findFirst({
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
    return contactRepository.findFirst({
      where: { companyId, phone, deletedAt: null },
    });
  }

  /**
   * 🛡️ 100-YEAR FIX: Save LID -> Phone mapping in Contact's customFields
   */
  async saveLidPhoneMapping(companyId: string, lid: string, phone: string) {
    try {
      const contact = await contactRepository.findFirst({
        where: { companyId, phone, deletedAt: null },
      });

      if (contact) {
        const currentFields =
          (contact.customFields as Prisma.JsonObject) || {};
        await contactRepository.updateByArgs({
          where: { id: contact.id },
          data: {
            customFields: {
              ...currentFields,
              whatsappLid: lid,
            } as Prisma.JsonObject,
          },
        });
        Logger.info(
          `[ChatService] 🎯 LID->Phone mapping saved: ${lid} -> ${phone}`,
        );
      }
    } catch (error) {
      Logger.warn(`[ChatService] Failed to save LID mapping`, { error });
    }
  }

  /**
   * 🛡️ 100-YEAR FIX: Find Contact by LID stored in customFields
   */
  async findContactByLid(companyId: string, lid: string) {
    return contactRepository.findFirst({
      where: {
        companyId,
        deletedAt: null,
        customFields: {
          path: ["whatsappLid"],
          equals: lid,
        },
      },
    });
  }

  /**
   * 🛡️ 100-YEAR FIX: Find Conversation by Contact's LID
   */
  async findConversationByLid(companyId: string, lid: string) {
    const contact = await this.findContactByLid(companyId, lid);
    if (!contact || !contact.phone) return null;

    const phoneChannelId = contact.phone.replace(/\D/g, "");
    return this.findConversation(
      companyId,
      phoneChannelId,
      `${phoneChannelId}@whatsapp.user`,
    );
  }

  /**
   * Create new conversation (Atomic)
   * 🛡️ 100-YEAR FIX: Now supports Group chats with metadata + Contact linking
   */
  async createConversation(data: {
    companyId: string;
    channelId: string;
    subject: string;
    userId?: string;
    contactId?: string;
    isGroup?: boolean;
    groupMetadata?: {
      groupName?: string;
      description?: string;
      participantCount?: number;
      groupPicUrl?: string | null;
    };
  }) {
    return conversationRepository.createRaw({
      data: {
        companyId: data.companyId,
        channelId: data.channelId,
        subject: data.subject,
        status: "OPEN",
        isGroup: data.isGroup ?? false,
        groupMetadata: data.groupMetadata ?? undefined,
        contactId: data.contactId ?? undefined,
        participants: data.userId
          ? { connect: [{ id: data.userId }] }
          : undefined,
      },
    });
  }

  /**
   * Update conversation status/timestamp
   * 🛡️ 100-YEAR FIX: Self-healing Contact linking for orphaned conversations
   */
  async updateConversation(
    id: string,
    updates: Prisma.ConversationUncheckedUpdateInput,
  ) {
    // Self-heal: Check if conversation is orphaned (no contactId) and link to Contact
    const conv = await conversationRepository.findFirst({
      where: { id },
      select: { contactId: true, channelId: true, companyId: true },
    });

    let contactLink: Record<string, string> = {};
    if (conv && !conv.contactId && conv.channelId) {
      const contact = await contactRepository.findFirst({
        where: {
          companyId: conv.companyId,
          phone: conv.channelId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (contact) {
        contactLink = { contactId: contact.id };
        Logger.info(
          `[ChatService] 🔗 Self-healed: Linked conversation ${id} to contact ${contact.id}`,
        );
      }
    }

    return conversationRepository.update(id, {
      ...updates,
      ...contactLink,
      updatedAt: new Date(),
    });
  }

  /**
   * Find Ghost Conversation (for merging)
   */
  async findGhostConversation(companyId: string) {
    return conversationRepository.findFirst({
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
    await messageRepository.updateMany({
      where: { conversationId, senderId: oldUserId },
      data: { senderId: newUserId },
    });

    await conversationRepository.update(conversationId, {
      participants: {
        disconnect: { id: oldUserId },
        connect: { id: newUserId },
      },
    });
  }

  async doesMessageExist(whatsappMessageId: string) {
    const exists = await messageRepository.findUnique({
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
    status: "SENT" | "DELIVERED" | "QUEUED" | "REVOKED";
    metadata: Prisma.InputJsonValue;
    createdAt?: Date;
  }) {
    return messageRepository.upsert({
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
    return conversationRepository.findByIdWithQueueAndParticipants(id);
  }

  // --- Ticket Methods ---

  async ensureTicket(
    companyId: string,
    conversationId: string,
    customerId: string,
    subject: string,
    description: string,
    queueId?: string | null,
  ) {
    const lockKey = `ticket_create:${conversationId}`;
    return await DistributedLock.run(
      lockKey,
      async () => {
        let ticket = await ticketRepository.findFirst({
          where: {
            companyId,
            conversationId,
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        });

        if (!ticket) {
          const lastTicket = await ticketRepository.findFirst({
            where: { companyId },
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          });
          const nextNum = (lastTicket?.ticketNumber || 0) + 1;

          ticket = await ticketRepository.create({
            data: {
              ticketNumber: nextNum,
              subject,
              description: description.substring(0, 100),
              status: "OPEN",
              priority: "MEDIUM",
              companyId,
              createdById: customerId,
              conversationId,
              queueId: queueId || null,
            },
          });
        } else if (queueId && !ticket.queueId) {
          ticket = await ticketRepository.update({
            where: { id: ticket.id },
            data: { queueId },
          });
          Logger.info(
            `[ChatService] 🩹 Self-healed ticket ${ticket.id} with queueId ${queueId}`,
          );
        }

        return ticket;
      },
      5000,
      10000,
    );
  }

  /**
   * Update message status (DELIVERED, READ, FAILED)
   */
  async updateMessageStatus(whatsappMessageId: string, status: string) {
    return messageRepository.updateMany({
      where: { whatsappMessageId },
      data: { status },
    });
  }

  /**
   * Update user profile picture
   */
  async updateUserProfilePic(userId: string, companyId: string, url: string) {
    return userRepository.update(userId, companyId, { profilePicUrl: url });
  }
}

export const chatService = new ChatService();
