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
  scheduledAt?: string | Date;
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
  const res = await apiClient.get("/conversations", { params });
  return res.data || res;
};

/**
 * GET MESSAGES
 */
export const getMessages = async (ticketId: string): Promise<Message[]> => {
  const res = await apiClient.get(`/conversations/${ticketId}`);
  // apiClient's response interceptor returns the response BODY. The backend wraps
  // the payload as { status, data: { conversation: { messages } } }. Be defensive
  // about the exact nesting so a future shape tweak never silently yields an empty
  // history (a network/HTTP error still rejects upstream and triggers a retry).
  const body = res as {
    data?: { conversation?: { messages?: Message[] } };
    conversation?: { messages?: Message[] };
  };
  const conversation = body?.data?.conversation ?? body?.conversation ?? null;
  return conversation?.messages ?? [];
};

/**
 * SEND MESSAGE
 */
export const sendMessage = async (
  ticketId: string,
  input: SendMessageInput,
): Promise<Message> => {
  const res = await apiClient.post(
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
  const res = await apiClient.post("/conversations/pick-next");
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
  const res = await apiClient.post("/conversations/create", input);
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
  const res = await apiClient.patch(
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
