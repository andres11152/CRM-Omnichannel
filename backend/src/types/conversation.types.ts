import {
  Channel,
  Conversation,
  User,
  ConversationStatus,
  Prisma,
  Contact,
  Message,
} from "@prisma/client";

export interface Attachment {
  name: string;
  type:
    | "image"
    | "video"
    | "document"
    | "audio"
    | "sticker"
    | "location"
    | "contact"
    | "note";
  url: string;
  mimeType?: string;
  mimetype?: string; // Frontend may send lowercase variant
  size?: number;
  [key: string]: Prisma.InputJsonValue | undefined;
}

export interface Metadata {
  scheduledAt?: string | Date;
  attachment?: Attachment;
  media?: Attachment;
  tempId?: string;
  quotedMessageId?: string;
  quotedContent?: string;
  [key: string]: Prisma.InputJsonValue | undefined;
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

// [PKG] MANAGER TYPES

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

export interface ConversationWithRelations extends Conversation {
  participants: User[];
  assignedTo?: User | null;
  contact?: Contact | null;
  messages: (Message & { 
    sender?: User | "agent" | "customer" | "system"; 
    senderName?: string; 
    attachment?: Attachment; 
    type?: string; 
    mediaUrl?: string 
  })[];
  // Transient properties for frontend UI state
  lastMessage?: string | null;
  lastMessageAt?: Date | null;
}

export interface IConversationEvents {
  onCreated: (conversation: Conversation) => void | Promise<void>;
  onUpdated: (conversation: Conversation) => void | Promise<void>;
}
