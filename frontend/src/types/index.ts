// Export all modules
export * from "./common.types";
export * from "./auth.types";
export * from "./contact.types";
export * from "./campaign.types";

/**
 * [CHAT] Chat & Messaging Types
 * (Defined here for convenience, should eventually have their own file)
 */
export interface Message {
  id: string;
  ticketId: string;
  conversationId?: string;

  content: string;
  type: "text" | "image" | "video" | "audio" | "document" | "template";
  sender: "agent" | "customer" | "system";
  senderName?: string;
  senderType?: "USER" | "BOT" | "SYSTEM";
  
  timestamp: string;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  
  mediaUrl?: string;
  companyId?: string;

  metadata?: {
    quotedMessageId?: string;
    quotedContent?: string;
    [key: string]: unknown;
  };
  reactions?: { reactBy: string; content: string }[];
}

export interface Conversation {
  id: string;
  contactId: string;
  channel: "WHATSAPP" | "INSTAGRAM";
  status: "OPEN" | "CLOSED";
  unreadCount: number;
  lastMessage?: Message;
}

/**
 * [AI] AI & Bot Configuration
 */
export interface AIConfig {
  companyId: string;
  provider: "openai" | "anthropic" | "gemini";
  model: string;
  isActive: boolean;
  temperature: number;
  systemPrompt: string;
  knowledgeBaseIds: string[];

  // Tools
  enableCrmLookup?: boolean;
  enableBooking?: boolean;
}

export interface SendMessageInput {
  content: string;
  type?: "text" | "image" | "video" | "audio" | "document";
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
  quotedMessageId?: string;
  quotedContent?: string;
}
