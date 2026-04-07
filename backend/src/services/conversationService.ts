import { Conversation, Message } from "@prisma/client";
import {
  CreateConversationDTO,
  ReplyDTO,
  ConversationListItem,
  ConversationWithRelations,
  Attachment,
  Metadata,
} from "@/types/conversation.types";

// Specialized Services
import { conversationQueryService } from "./ConversationQueryService";
import { conversationActionService } from "./ConversationActionService";
import { conversationMessageService } from "./ConversationMessageService";

/**
 * ️ CONVERSATION SERVICE (FACADE)
 *
 * This service acts as a single point of entry for the Controller, delegating
 * specific tasks to specialized services to maintain Single Responsibility (SRP).
 */
export const conversationService = {
  // --- QUERY OPERATIONS ---
  async listConversations(
    companyId: string,
    userId: string,
    role: string,
  ): Promise<ConversationListItem[]> {
    return conversationQueryService.listConversations(companyId, userId, role);
  },

  async getConversation(companyId: string, id: string): Promise<ConversationWithRelations> {
    return conversationQueryService.getConversation(companyId, id);
  },

  // --- ACTION OPERATIONS ---
  async createConversation(dto: CreateConversationDTO): Promise<ConversationWithRelations> {
    return conversationActionService.createConversation(dto);
  },

  async updateTags(companyId: string, id: string, tags: string[]): Promise<Conversation> {
    return conversationActionService.updateTags(companyId, id, tags);
  },

  async resolveAndClose(companyId: string, id: string): Promise<Conversation> {
    return conversationActionService.resolveAndClose(companyId, id);
  },

  async updateSyncEnabled(companyId: string, id: string, enabled: boolean) {
    return conversationActionService.updateSyncEnabled(companyId, id, enabled);
  },

  async assignToQueue(companyId: string, id: string, queueId: string | null): Promise<Conversation> {
    return conversationActionService.assignToQueue(companyId, id, queueId);
  },

  async assignToAgent(companyId: string, id: string, agentId: string): Promise<Conversation> {
    return conversationActionService.assignToAgent(companyId, id, agentId);
  },

  // --- MESSAGE OPERATIONS ---
  async replyToConversation(
    dto: ReplyDTO,
  ): Promise<Message | { id: string; content: string; timestamp?: Date; status?: string, sender?: string }> {
    return conversationMessageService.replyToConversation(dto);
  },

  async sendMessageToWhatsApp(
    companyId: string,
    conversationId: string,
    senderId: string,
    phone: string,
    content: string,
    attachment?: Attachment,
    metadata?: Metadata,
  ): Promise<void> {
    return conversationMessageService.sendMessageToWhatsApp(
      companyId,
      conversationId,
      senderId,
      phone,
      content,
      attachment,
      metadata,
    );
  },

  async reactToMessage(
    companyId: string,
    conversationId: string,
    messageId: string,
    reaction: string,
    userId: string,
  ): Promise<void> {
    return conversationMessageService.reactToMessage(
      companyId,
      conversationId,
      messageId,
      reaction,
      userId,
    );
  },
};
