// Export all modules
export * from "./common.types";
export * from "./auth.types";
export * from "./contact.types";
export * from "./campaign.types";

/**
 * 💬 Chat & Messaging Types
 * (Defined here for convenience, should eventually have their own file)
 */
export interface Message {
  id: string;
  conversationId: string;
  ticketId?: string;

  direction: "INBOUND" | "OUTBOUND";
  type: "text" | "image" | "video" | "audio" | "document" | "template";

  content: string; // Text content or Caption
  mediaUrl?: string;

  status: "SENT" | "DELIVERED" | "READ" | "FAILED";

  senderId?: string; // If outbound (Agent ID)
  timestamp: string;
  metadata?: any;
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
 * 🤖 AI & Bot Configuration
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
