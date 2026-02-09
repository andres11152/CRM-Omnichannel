/**
 * DOMAIN TYPES - STRICT TYPE SYSTEM
 *
 * NO ANY ALLOWED - Comprehensive type definitions for the entire domain
 * These types match the backend Prisma schema exactly
 */

// ============================================
// ENUMS (Match backend exactly)
// ============================================

export enum Channel {
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
  WEB_CHAT = "WEB_CHAT",
  TELEGRAM = "TELEGRAM",
  FACEBOOK_MESSENGER = "FACEBOOK_MESSENGER",
  INSTAGRAM_DM = "INSTAGRAM_DM",
}

export enum MessageDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum ConversationStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum UserRole {
  USER = "USER",
  AGENT = "AGENT",
  SUPERVISOR = "SUPERVISOR",
  ADMIN = "ADMIN",
  MASTER = "MASTER",
}

export enum MessageStatus {
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}

export enum CompanyStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  TRIAL = "TRIAL",
}

// ============================================
// BASE TYPES
// ============================================

export interface BaseEntity {
  id: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string;
}

// ============================================
// USER TYPES
// ============================================

export interface User extends BaseEntity {
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  preferences: UserPreferences | null;
}

export interface UserPreferences {
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  language: string;
  timezone: string;
  theme: "light" | "dark" | "auto";
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
}

// ============================================
// COMPANY TYPES
// ============================================

export interface Company extends BaseEntity {
  name: string;
  status: CompanyStatus;
  planId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
}

// ============================================
// CONTACT TYPES
// ============================================

export interface Contact extends BaseEntity {
  name: string;
  email: string | null;
  phone: string | null;
  companyId: string;
  avatarUrl: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
}

// ============================================
// MESSAGE TYPES
// ============================================

export interface MessageMedia {
  type: "image" | "video" | "audio" | "document";
  url: string;
  name?: string;
  size?: number;
  mimetype?: string;
}

export interface MessageMetadata {
  messageId?: string;
  media?: MessageMedia;
  quotedMessage?: {
    id: string;
    content: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  [key: string]: unknown; // Allow additional metadata
}

export interface Message extends BaseEntity {
  content: string;
  channel: Channel;
  direction: MessageDirection;
  status: MessageStatus;
  conversationId: string;
  senderId: string;
  sender: UserListItem;
  metadata: MessageMetadata | null;
}

export interface MessageCreate {
  content: string;
  conversationId: string;
  media?: MessageMedia;
}

// ============================================
// CONVERSATION TYPES
// ============================================

export interface Conversation extends BaseEntity {
  subject: string | null;
  status: ConversationStatus;
  companyId: string;
  channelId: string | null;
  tags: string[];
  resolvedAt: string | null;

  // Relations
  participants: UserListItem[];
  assignedTo: UserListItem | null;
  contact: Contact | null;

  // Aggregates (from optimized query)
  messageCount: number;
  lastMessage?: Message;
}

export interface UserBasic {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface MessagePreview {
  id: string;
  content: string;
  createdAt: string;
  sender: UserBasic;
}

export interface ConversationListItem {
  id: string;
  ticketId?: string;
  subject: string | null;
  status: ConversationStatus;
  priority?: string;
  channel?: string;
  updatedAt: string;
  messageCount: number;
  unreadCount: number;
  assignedTo: UserBasic | null;
  contact?: Contact | null;
  lastMessage?: MessagePreview | null; // Optional and Nullable
  typingStatus?: "composing" | "recording" | "paused";
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
  messagePagination: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
}

export interface ConversationCreate {
  subject?: string;
  channelId: string;
  contactId?: string;
  tags?: string[];
}

export interface ConversationUpdate {
  subject?: string;
  status?: ConversationStatus;
  assignedToId?: string | null;
  tags?: string[];
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  message?: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

export interface PaginatedResponse<T> {
  status: "success";
  results: number;
  data: {
    items: T[];
    pagination: {
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
      limit: number;
    };
  };
}

export interface ConversationListResponse {
  status: "success";
  results: number;
  data: {
    conversations: ConversationListItem[];
    pagination: {
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
      limit: number;
    };
  };
}

export interface MessageListResponse {
  status: "success";
  results: number;
  data: {
    messages: Message[];
    pagination: {
      hasMore: boolean;
      nextCursor: string | null;
      limit: number;
    };
  };
}

// ============================================
// FORM TYPES
// ============================================

export interface LoginForm {
  email: string;
  password: string;
}

export interface SignupForm {
  email: string;
  password: string;
  name: string;
  companyName?: string;
}

export interface MessageForm {
  content: string;
  media?: File;
}

// ============================================
// STATE TYPES (for React components)
// ============================================

export interface ConversationState {
  conversations: ConversationListItem[];
  selectedConversation: ConversationDetail | null;
  loading: boolean;
  error: string | null;
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface MessageState {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

// ============================================
// UTILITY TYPES
// ============================================

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Type guard helpers
export function isConversation(obj: unknown): obj is Conversation {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "status" in obj &&
    "participants" in obj
  );
}

export function isMessage(obj: unknown): obj is Message {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "content" in obj &&
    "channel" in obj &&
    "direction" in obj
  );
}

export function isUser(obj: unknown): obj is User {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "email" in obj &&
    "role" in obj
  );
}
