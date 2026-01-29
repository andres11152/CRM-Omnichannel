/**
 * 🔒 MESSAGE PROCESSING TYPE DEFINITIONS
 *
 * Centralized type definitions for message handling, events, and socket payloads.
 * Eliminates anonymous types and 'any' usage in message flow.
 *
 * @module MessageTypes
 * @version 1.0.0
 */

import {
  Channel,
  MessageDirection,
  Message,
  User,
  Conversation,
  Contact,
} from "@prisma/client";

// ============================================================================
// 📨 INCOMING MESSAGE TYPES
// ============================================================================

export interface MessagingMediaPayload {
  url: string;
  type: "image" | "video" | "document" | "audio";
  mimetype?: string;
  caption?: string;
  filename?: string;
}

export interface IncomingMessagePayload {
  companyId: string;
  sessionId: string;
  remoteJid: string; // Raw Phone number or JID
  text: string;
  isOutbound: boolean;
  contactName?: string;
  senderName?: string;
  hasMedia?: boolean;
  media?: MessagingMediaPayload;
  profilePicUrl?: string; // WhatsApp Profile Picture URL
  about?: string; // WhatsApp Status/About
  originalLid?: string; // Original, unresolved LID used for merging legacy contacts
}

// ============================================================================
// 📤 OUTGOING & SOCKET TYPES
// ============================================================================

export interface SocketDashboardPayload {
  id: string;
  channel: string;
  subject: string;
  lastMessage: string | null;
  lastMessageAt: Date;
  unreadCount: number;
  contact: {
    id: string;
    name: string;
    phone: string | null;
    avatarUrl: string | null;
    profilePicUrl?: string | null;
    about?: string | null;
  };
}

export interface MessageWithSender extends Message {
  sender?: User;
}

export interface ConversationWithQueue extends Conversation {
  unreadCount?: number;
  queue?: {
    aiAssistant?: {
      id: string;
      name: string;
    } | null;
  } | null;
  messages?: MessageWithSender[];
}

export interface ProcessingError extends Error {
  code?: string;
  meta?: unknown;
}
