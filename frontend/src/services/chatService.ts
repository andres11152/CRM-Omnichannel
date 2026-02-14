import apiClient from "./apiClient";

/**
 * CHAT SERVICE
 * Handles all chat-related API calls
 */

// Types
export interface Message {
  id: string;
  ticketId: string;
  content: string;
  type: "text" | "image" | "video" | "audio" | "document";
  sender: "agent" | "customer" | "system";
  senderName?: string;
  timestamp: string;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  mediaUrl?: string;
  metadata?: any;
}

export interface Conversation {
  id: string;
  ticketId: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: "open" | "pending" | "resolved";
  assignedTo?: string;
  channel: "whatsapp" | "email" | "web";
  tags?: string[];
}

export interface SendMessageInput {
  content: string;
  type?: "text" | "image" | "video" | "audio" | "document";
  mediaUrl?: string;
  metadata?: any;
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
  const response = await apiClient.get<{
    conversations: Conversation[];
    total: number;
  }>("/conversations", { params });
  return response.data;
};

/**
 * GET MESSAGES
 * Fetches message history for a specific ticket
 */
export const getMessages = async (ticketId: string): Promise<Message[]> => {
  const response = await apiClient.get<Message[]>(
    `/conversations/${ticketId}/messages`
  );
  return response.data;
};

/**
 * SEND MESSAGE
 * Sends a new message to a conversation
 */
export const sendMessage = async (
  ticketId: string,
  input: SendMessageInput
): Promise<Message> => {
  const response = await apiClient.post<Message>(
    `/conversations/${ticketId}/messages`,
    input
  );
  return response.data;
};

/**
 * RESOLVE TICKET
 * Marks a ticket as resolved
 */
export const resolveTicket = async (
  ticketId: string,
  input: ResolveTicketInput
): Promise<void> => {
  await apiClient.patch(`/conversations/${ticketId}/resolve`, input);
};

/**
 * PICK NEXT TICKET
 * Assigns the next available ticket to the current agent
 */
export const pickNextTicket = async (): Promise<Conversation | null> => {
  const response = await apiClient.post<{ conversation: Conversation | null }>(
    "/conversations/pick-next"
  );
  return response.data.conversation;
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
  const response = await apiClient.post<Conversation>(
    "/conversations/create",
    input
  );
  return response.data;
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
};
