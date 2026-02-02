import { proto } from "@whiskeysockets/baileys";

/**
 * 📨 WhatsApp Event Contracts
 * Strict typing for Baileys events and extended payloads
 */

// 1. Extended Key for Smart Extraction (LID resolution)
export interface ExtendedMessageKey extends proto.IMessageKey {
  // Undocumented fields present in Baileys runtime for specific event types
  senderPn?: string; // Real phone number hidden in LID events
  remoteJidAlt?: string; // Alternative JID
}

// 2. Strict Message Wrapper
export interface StrictWAMessage extends proto.IWebMessageInfo {
  key: ExtendedMessageKey;
}

// 3. Message Metadata (DB Stored JSON)
export interface MessageMetadata {
  messageId?: string;
  media?: {
    type: "image" | "video" | "audio" | "document" | "sticker";
    size?: number;
    url?: string;
  };
  ticketId?: string;
  origin?: "whatsapp" | "phone_sync" | "web";
  aiGenerated?: boolean;
  aiAssistantId?: string;
  [key: string]: unknown; // Allow flexibility for future fields
}

// 4. Session Data (Replacing session: any)
export interface SessionData {
  companyId: string;
  sessionId: string;
  status: "CONNECTED" | "DISCONNECTED" | "QR_READY";
  userId?: string; // JID of the bot
}

/**
 * 📡 EVENT PAYLOADS
 */
export interface MessageReceivedEvent {
  message: StrictWAMessage;
  sessionId: string;
}

export interface ConnectionUpdateEvent {
  sessionId: string;
  connection: "open" | "close" | "connecting";
  lastDisconnect?: {
    error?: Error;
    date?: Date;
  };
  qr?: string;
}
