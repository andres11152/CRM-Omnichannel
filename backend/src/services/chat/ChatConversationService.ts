import { Prisma } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { contactRepository } from "@/repositories/ContactRepository";

/**
 * [CHAT] CHAT CONVERSATION SERVICE
 * Handles conversation persistence, creation, and resolution strategies.
 */
export class ChatConversationService {
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
   * Create new conversation (Atomic)
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
        isGroup: data.isGroup || false,
        groupMetadata: data.groupMetadata || undefined,
        contactId: data.contactId || undefined,
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
    companyId: string,
    id: string,
    updates: Prisma.ConversationUncheckedUpdateInput,
  ) {
    // Self-heal: Check if conversation is orphaned (no contactId) and link to Contact
    const conv = await conversationRepository.findFirst({
      where: { id, companyId },
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
          `[ChatConversationService]  Self-healed: Linked conversation ${id} to contact ${contact.id}`,
        );
      }
    }

    return conversationRepository.update(companyId, id, {
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

  /**
   * Fetch Full Conversation Context for Events
   */
  async getFullConversation(companyId: string, id: string) {
    return conversationRepository.findByIdWithQueueAndParticipants(companyId, id);
  }
}

export const chatConversationService = new ChatConversationService();
