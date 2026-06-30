import { Prisma } from "@prisma/client";

// Re-export the fragmented services
import { chatIdentityService } from "./chat/ChatIdentityService";
import { chatConversationService } from "./chat/ChatConversationService";
import { chatMessageService } from "./chat/ChatMessageService";
import { userRepository } from "@/repositories/UserRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { messageRepository } from "@/repositories/MessageRepository";

/**
 * [CHAT] CHAT SERVICE (FACADE)
 * This acts as a facade over the specialized chat services to maintain backward compatibility
 * while enforcing the Single Responsibility Principle internally.
 */
export class ChatServiceFacade {
  // --- IDENTITY DELEGATION ---
  
  async findUserByPhone(companyId: string, phone: string, excludeEmail?: string) {
    return chatIdentityService.findUserByPhone(companyId, phone, excludeEmail);
  }

  async findUserByName(companyId: string, name: string) {
    return chatIdentityService.findUserByName(companyId, name);
  }

  async upsertWhatsAppUser(params: {
    email: string;
    name: string;
    companyId: string;
    phone?: string | null;
    role?: "USER" | "AGENT" | "ADMIN" | "MASTER";
  }) {
    return chatIdentityService.upsertWhatsAppUser(params);
  }

  async updateUserProfilePic(userId: string, companyId: string, url: string) {
    return chatIdentityService.updateUserProfilePic(userId, companyId, url);
  }

  async findContact(companyId: string, phone: string) {
    return chatIdentityService.findContact(companyId, phone);
  }

  async saveLidPhoneMapping(companyId: string, lid: string, phone: string) {
    return chatIdentityService.saveLidPhoneMapping(companyId, lid, phone);
  }

  async findContactByLid(companyId: string, lid: string) {
    return chatIdentityService.findContactByLid(companyId, lid);
  }

  // --- CONVERSATION DELEGATION ---

  async findConversation(companyId: string, channelId: string, userEmail: string) {
    return chatConversationService.findConversation(companyId, channelId, userEmail);
  }

  async findConversationByLid(companyId: string, lid: string) {
    const contact = await chatIdentityService.findContactByLid(companyId, lid);
    if (!contact || !contact.phone) return null;

    const phoneChannelId = contact.phone.replace(/\D/g, "");
    return chatConversationService.findConversation(
      companyId,
      phoneChannelId,
      `${phoneChannelId}@whatsapp.user`,
    );
  }

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
    return chatConversationService.createConversation(data);
  }

  async updateConversation(
    companyId: string,
    id: string,
    updates: Prisma.ConversationUncheckedUpdateInput,
  ) {
    return chatConversationService.updateConversation(companyId, id, updates);
  }

  async findGhostConversation(companyId: string) {
    return chatConversationService.findGhostConversation(companyId);
  }

  async getFullConversation(companyId: string, id: string) {
    return chatConversationService.getFullConversation(companyId, id);
  }

  // --- MESSAGE & TICKET DELEGATION ---

  async doesMessageExist(whatsappMessageId: string) {
    return chatMessageService.doesMessageExist(whatsappMessageId);
  }

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
    return chatMessageService.upsertMessage(data);
  }

  async updateMessageStatus(
    whatsappMessageId: string,
    status: "SENT" | "DELIVERED" | "READ" | "FAILED",
  ) {
    return chatMessageService.updateMessageStatus(whatsappMessageId, status);
  }

  async findActiveTicket(companyId: string, conversationId: string) {
    return chatMessageService.findActiveTicket(companyId, conversationId);
  }

  async ensureTicket(
    companyId: string,
    conversationId: string,
    customerId: string,
    subject: string,
    description: string,
    queueId?: string | null,
  ) {
    return chatMessageService.ensureTicket(companyId, conversationId, customerId, subject, description, queueId);
  }

  // --- CROSS-CUTTING LOGIC ---

  /**
   * Helper to resolve a conversation by JID, creating it if it doesn't exist.
   * Useful for events where the specific message might be missing (e.g. Pin/Unpin).
   */
  async findOrCreateConversationByJid(companyId: string, remoteJid: string) {
    // Strip domain AND multi-device suffix (":0", ":1") so PIN events with
    // JIDs like "573...:0@s.whatsapp.net" don't create duplicate conversations.
    const chatUniqueId = remoteJid.split("@")[0].split(":")[0];
    const chatEmail = `${chatUniqueId}@whatsapp.user`;

    let conv = await this.findConversation(companyId, chatUniqueId, chatEmail);
    if (!conv) {
      conv = await this.createConversation({
        companyId,
        channelId: chatUniqueId,
        subject: chatUniqueId, // Fallback
      });
    }
    return conv;
  }

  async migrateConversationHistory(
    companyId: string,
    conversationId: string,
    oldUserId: string,
    newUserId: string,
  ) {
    await messageRepository.updateMany({
      where: { companyId, conversationId, senderId: oldUserId },
      data: { senderId: newUserId },
    });

    await conversationRepository.update(companyId, conversationId, {
      participants: {
        disconnect: { id: oldUserId },
        connect: { id: newUserId },
      },
    });
  }
}

export const chatService = new ChatServiceFacade();
