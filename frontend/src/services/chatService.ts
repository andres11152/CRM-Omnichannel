import apiClient from "./apiClient";
import { Message, Conversation } from "../types";

export interface SendMessageInput {
  content: string;
  type?: "text" | "image" | "video" | "audio" | "document";
  mediaUrl?: string;
  attachment?: {
    name: string;
    type: string;
    url: string;
    mimetype?: string;
  };
  metadata?: Record<string, unknown>;
  quotedMessageId?: string;
  quotedContent?: string;
}

export interface ResolveTicketInput {
  resolutionType: "sales" | "support" | "admin" | "other" | "spam";
  notes?: string;
}

/**
 * GET CONVERSATIONS
 * Fetches list of conversations/tickets
 */
export const getConversations = async (params?: {
  status?: "open" | "pending" | "resolved";
  page?: number;
  limit?: number;
}): Promise<{ conversations: Conversation[]; total: number }> => {
  const response = await apiClient.get<any>("/conversations", { params });
  return (response.data || response) as { conversations: Conversation[]; total: number };
};

/**
 * GET MESSAGES
 * Fetches message history for a specific ticket
 */
export const getMessages = async (ticketId: string): Promise<Message[]> => {
  const response = await apiClient.get<any>(`/conversations/${ticketId}`);
  // Extracting from data.conversation.messages based on backend structure
  const data = response.data || response;
  return data?.conversation?.messages || [];
};

/**
 * SEND MESSAGE
 * Sends a new message to a conversation
 */
export const sendMessage = async (
  ticketId: string,
  input: SendMessageInput,
): Promise<Message> => {
  const response = await apiClient.post<any>(
    `/conversations/${ticketId}/reply`,
    input,
  );
  const data = response.data || response;
  return data.message || data;
};

/**
 * RESOLVE TICKET
 * Marks a ticket as resolved
 */
export const resolveTicket = async (
  ticketId: string,
  input: ResolveTicketInput,
): Promise<void> => {
  await apiClient.patch(`/conversations/${ticketId}/resolve`, input);
};

/**
 * PICK NEXT TICKET
 * Assigns the next available ticket to the current agent
 */
export const pickNextTicket = async (): Promise<Conversation | null> => {
  const response = await apiClient.post<any>("/conversations/pick-next");
  const data = response.data || response;
  return data.conversation;
};

/**
 * DELETE TICKET
 * Deletes a conversation/ticket
 */
export const deleteTicket = async (ticketId: string): Promise<void> => {
  await apiClient.delete(`/conversations/${ticketId}`);
};

/**
 * MARK AS READ
 * Marks all messages in a conversation as read
 */
export const markAsRead = async (ticketId: string): Promise<void> => {
  await apiClient.post(`/conversations/${ticketId}/mark-read`);
};

/**
 * CREATE NEW CHAT
 * Initiates a new conversation
 */
export const createNewChat = async (input: {
  phone: string;
  name?: string;
  initialMessage?: string;
  addToContacts?: boolean;
}): Promise<Conversation> => {
  const response = await apiClient.post<any>("/conversations/create", input);
  const data = response.data || response;
  return data.conversation || data;
};

/**
 * TOGGLE GROUP SYNC
 * Enables or disables automatic contact synchronization for a group
 */
export const toggleGroupSync = async (
  ticketId: string,
  enabled: boolean,
): Promise<{ syncEnabled: boolean }> => {
  const response = await apiClient.patch<any>(
    `/conversations/${ticketId}/toggle-sync`,
    { enabled },
  );
  return response.data || response;
};

export const chatService = {
  getConversations,
  getMessages,
  sendMessage,
  resolveTicket,
  pickNextTicket,
  deleteTicket,
  markAsRead,
  createNewChat,
  toggleGroupSync,
  transferTicket: async (
    ticketId: string,
    targetId: string,
    type: "AGENT" | "QUEUE",
  ): Promise<void> => {
    const payload =
      type === "AGENT" ? { assignedToId: targetId } : { queueId: targetId };
    await apiClient.patch(`/tickets/${ticketId}`, payload);
  },
  reactToMessage: async (
    conversationId: string,
    messageId: string,
    reaction: string,
  ): Promise<void> => {
    await apiClient.post(
      `/conversations/${conversationId}/messages/${messageId}/react`,
      { reaction },
    );
  },
};
