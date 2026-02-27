import {
  Channel,
  Conversation,
  User,
  ConversationStatus,
} from "@prisma/client";

export interface Attachment {
  name: string;
  type: "image" | "video" | "document" | "audio";
  url: string;
  mimeType?: string;
  mimetype?: string; // Frontend may send lowercase variant
  size?: number;
}

export interface Metadata extends Record<string, unknown> {
  scheduledAt?: string | Date;
  attachment?: Attachment;
  tempId?: string;
}

export interface CreateConversationDTO {
  companyId: string;
  agentId: string;
  phone: string;
  name?: string;
  message?: string;
  addToContacts?: boolean;
}

export interface ReplyDTO {
  companyId: string;
  userId: string;
  conversationId: string;
  content?: string;
  channel?: Channel;
  attachment?: Attachment;
  metadata?: Metadata;
  scheduledAt?: string | Date;
  quotedMessageId?: string; // ID of the message being replied to
  quotedContent?: string; // Optional preview snippet of the quoted message
}

export interface ConversationListItem {
  id: string;
  ticketId: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  status: string;
  assignedTo?: string | null;
  channel: string;
  participants: User[];
}

export interface SendMessageOptions {
  companyId: string;
  conversationId: string;
  senderId: string;
  media?: Attachment;
  metadata?: Metadata;
  quotedMessageId?: string;
}

// 📦 MANAGER TYPES

export interface FindOrCreateConversationParams {
  companyId: string;
  channelId: string; // Phone number, email, etc.
  customerId: string;
  subject?: string;
  status?: ConversationStatus;
}

export interface UpdateConversationParams {
  status?: ConversationStatus;
  assignedToId?: string | null;
  subject?: string;
}

export interface IConversationEvents {
  onCreated: (conversation: Conversation) => void | Promise<void>;
  onUpdated: (conversation: Conversation) => void | Promise<void>;
}
