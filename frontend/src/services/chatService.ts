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
 */
export const getConversations = async (params?: {
  status?: "open" | "pending" | "resolved";
  page?: number;
  limit?: number;
}): Promise<{ conversations: Conversation[]; total: number }> => {
  const res = await apiClient.get<any>("/conversations", { params });
  return res.data || res;
};

/**
 * GET MESSAGES
 */
export const getMessages = async (ticketId: string): Promise<Message[]> => {
  const res = await apiClient.get<any>(`/conversations/${ticketId}`);
  const payload = res.data || res;
  return payload?.conversation?.messages || [];
};

/**
 * SEND MESSAGE
 */
export const sendMessage = async (
  ticketId: string,
  input: SendMessageInput,
): Promise<Message> => {
  const res = await apiClient.post<any>(
    `/conversations/${ticketId}/reply`,
    input,
  );
  const payload = res.data || res;
  return payload.message || payload;
};

/**
 * RESOLVE TICKET
 */
export const resolveTicket = async (
  ticketId: string,
  input: ResolveTicketInput,
): Promise<void> => {
  await apiClient.patch(`/conversations/${ticketId}/resolve`, input);
};

/**
 * PICK NEXT TICKET
 */
export const pickNextTicket = async (): Promise<Conversation | null> => {
  const res = await apiClient.post<any>("/conversations/pick-next");
  const payload = res.data || res;
  return payload.conversation || null;
};

/**
 * DELETE TICKET
 */
export const deleteTicket = async (ticketId: string): Promise<void> => {
  await apiClient.delete(`/conversations/${ticketId}`);
};

/**
 * MARK AS READ
 */
export const markAsRead = async (ticketId: string): Promise<void> => {
  await apiClient.post(`/conversations/${ticketId}/mark-read`);
};

/**
 * CREATE NEW CHAT
 */
export const createNewChat = async (input: {
  phone: string;
  name?: string;
  initialMessage?: string;
  addToContacts?: boolean;
}): Promise<Conversation> => {
  const res = await apiClient.post<any>("/conversations/create", input);
  const payload = res.data || res;
  return payload.conversation || payload;
};

/**
 * TOGGLE GROUP SYNC
 */
export const toggleGroupSync = async (
  ticketId: string,
  enabled: boolean,
): Promise<{ syncEnabled: boolean }> => {
  const res = await apiClient.patch<any>(
    `/conversations/${ticketId}/toggle-sync`,
    { enabled },
  );
  return res.data || res;
};

/**
 * SYNC FULL HISTORY
 */
export const syncFullHistory = async (ticketId: string): Promise<void> => {
  await apiClient.post(`/conversations/${ticketId}/sync`);
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
  syncFullHistory,
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
