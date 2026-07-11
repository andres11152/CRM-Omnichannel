// Define channel types
import {
  User as AuthUser,
  Company as AuthCompany,
  CompanyStatus as AuthCompanyStatus,
} from "./types/auth.types";
import { BaseEntity } from "./types/common.types";
// Define channel types
// FIXED: Synced with Prisma Schema (UPPERCASE values) to prevent logic errors in backend controllers
export enum Channel {
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
  WEB_CHAT = "WEB_CHAT",
  TELEGRAM = "TELEGRAM",
  FACEBOOK_MESSENGER = "FACEBOOK_MESSENGER",
  INSTAGRAM_DM = "INSTAGRAM_DM",
}

export enum SenderType {
  USER = "USER",
  AGENT = "AGENT",
  BOT = "BOT",
  SYSTEM = "SYSTEM",
}

// Added UserRole to match Prisma
export enum UserRole {
  USER = "USER",
  AGENT = "AGENT",
  ADMIN = "ADMIN",
  MASTER = "MASTER",
}

export type User = AuthUser;

export interface UploadResult {
  url: string;
  key: string;
  provider: "s3" | "local";
}

export type PlanFeatureValue = number | boolean | string;

export interface PlanConfig {
  max_users: number;
  max_queues: number;
  max_whatsapp_connections: number;
  can_use_ai: boolean;
  can_remove_branding: boolean;
  can_use_api: boolean;
  [key: string]: PlanFeatureValue;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  stripePriceId?: string;
  config: PlanConfig;
  isActive: boolean;
  createdAt?: Date;
}

export type CompanyStatus = AuthCompanyStatus;

export type Company = AuthCompany;

export interface Document {
  id: string;
  companyId: string;
  filename: string;
  content: string;
  uploadDate: Date;
  status: "indexed" | "processing" | "error";
  size: string;
}

export interface Tag {
  id: string;
  companyId: string;
  name: string;
  color: string;
  createdAt?: string | Date;
  count?: number;
}

export interface Message {
  id: string;
  senderId?: string;
  ticketId: string;
  conversationId?: string;
  companyId: string;
  content: string;
  senderType: SenderType;
  timestamp: Date | string;
  senderName?: string;
  attachment?: {
    id?: string;
    type:
      | "image"
      | "video"
      | "file"
      | "audio"
      | "sticker"
      | "location"
      | "contact"
      | "contact_list"
      // [SEC] HISTORY SYNC: Synthetic types for historical messages that only have placeholders
      | "image_unavailable"
      | "video_unavailable"
      | "audio_unavailable"
      | "document_unavailable";
    url?: string;
    name?: string;
    size?: number;
    mimeType?: string;
    isPrivate?: boolean;
  };
  direction?: "INBOUND" | "OUTBOUND";
  status?:
    | "sending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "pending"
    | "scheduled"
    | "SCHEDULED"
    | "REVOKED";
  sender?: "agent" | "customer" | "system" | { id: string; name: string; phone?: string; email?: string };
  type?: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | string;
  mediaUrl?: string;
  metadata?: {
    quotedMessageId?: string;
    quotedContent?: string;
    scheduledAt?: string | Date;
    attachment?: {
      id?: string;
      name?: string;
      url?: string;
      size?: number;
    };
    source?: string;
    [key: string]: unknown;
  };
  reactions?: {
    reactBy: string;
    content: string;
    isMe?: boolean;
  }[];
}

// SIMPLIFIED: Represents the person, not the conversation
export interface Contact {
  id: string;
  ticketId?: string; // Associated ticket ID for resolution operations
  realContactId?: string; // ID real en la tabla contacts
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  avatarUrl: string;
  // Fix: Add properties for conversation summary to resolve type errors in multiple components
  lastMessage: string;
  lastMessageTime: Date | string;
  unreadCount?: number;
  tags: string[];
  notes?: string;
  channel?: Channel;
  assignedMode?: "human" | "bot";
  // FIXED: Removed 'PENDING' to match Prisma ConversationStatus
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  queueName?: string;
  assignedAgentName?: string;
  assignedToId?: string | null;
  channelId?: string;
  profilePicUrl?: string; // WhatsApp Profile Picture URL
  about?: string; // WhatsApp Status/About
  //  GROUP CHAT SUPPORT
  isGroup?: boolean;
  // [APP] Multi-WhatsApp Session Identification (#1, #2, #3)
  whatsappSessionIndex?: number;
  whatsappSessionPhone?: string;
  // Ticket-specific metadata for UI
  priority?: string;
  ticketCreatedAt?: Date | string;
  // Direction of the last message — INBOUND means the customer is waiting
  // for a reply; OUTBOUND means we already answered.
  lastMessageDirection?: "INBOUND" | "OUTBOUND" | null;
  // Real WhatsApp block state (mirrors Contact.isBlocked in the CRM).
  isBlocked?: boolean;
  // Inbox organization (mirrors Baileys chatModify — archive/pin/mute).
  isArchived?: boolean;
  isPinned?: boolean;
  mutedUntil?: string | null;
}

// NEW: Represents the conversation/case
export interface Conversation {
  id: string;
  companyId: string;
  channel: Channel;
  ticketId?: string;
  contactId?: string;
  contactName?: string;
  status: "OPEN" | "CLOSED" | "PENDING" | "RESOLVED";
  unreadCount: number;
  lastMessage?: string;
  lastMessageAt?: Date | string;
  lastMessageTime?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  syncEnabled?: boolean;
  contact?: {
    id: string;
    name: string;
    phone?: string;
    profilePicUrl?: string;
  };
}

export interface TicketContact {
  id: string;
  realContactId?: string;
  name: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  profilePicUrl?: string | null;
  about?: string | null;
  companyId: string;
  channelId: string;
  unreadCount?: number;
  status?: string;
  queueName?: string;
  assignedAgentName?: string;
  // Real WhatsApp block state (mirrors Contact.isBlocked in the CRM).
  isBlocked?: boolean;
  //  GROUP CHAT SUPPORT
  isGroup?: boolean;
  // [APP] Multi-WhatsApp Session Identification (#1, #2, #3)
  whatsappSessionIndex?: number;
  whatsappSessionPhone?: string;
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  unreadCount: number;
  // companyId is not in DTO explicitly outside of contact, but maybe useful? Check DTO.
  // DTO doesn't have top-level companyId. Let's make it optional or remove if not sent.
  companyId?: string;
  subject: string | null;
  description: string | null;
  priority: string; // "LOW" | "MEDIUM" ...
  contact: TicketContact;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

  queue: { id: string; name: string } | null;
  assignedTo: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  } | null;

  lastMessage: string;
  lastMessageAt: string; // ISO Date
  // Direction of the last message — INBOUND means the customer is waiting
  // for a reply; OUTBOUND means we already answered.
  lastMessageDirection?: "INBOUND" | "OUTBOUND" | null;
  createdAt: string; // ISO Date
  updatedAt: string;
  resolvedAt?: string | null;

  // Inbox organization (mirrors Baileys chatModify — archive/pin/mute)
  isArchived?: boolean;
  isPinned?: boolean;
  mutedUntil?: string | null;

  channel: string;
  tags: string[];
  conversationId: string | null;

  // Legacy fields for compatibility (can be optional)
  queueId?: string | null;
  assignedToId?: string | null;

  //  GROUP CHAT SUPPORT (Enterprise CRM Feature)
  isGroup?: boolean;
  groupMetadata?: {
    groupName?: string;
    description?: string;
    participantCount?: number;
    groupPicUrl?: string | null;
  } | null;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  email?: string;
  role?: "admin" | "agent" | "MASTER";
  status: "online" | "offline" | "busy";
  currentLoad: number;
  maxCapacity: number;
  avatar: string;
  department: "Sales" | "Support" | string;
  queues?: { id: string; name: string }[];
  lastSeen?: Date | string;
}

export interface QueueJob {
  id: string;
  companyId: string;
  ticketId: string;
  contactName: string;
  channel: Channel;
  status: "waiting" | "processing" | "completed" | "failed";
  timestamp: number;
  priority: number;
}

export interface AIConfig {
  companyId: string;
  provider: "gemini" | "openai";
  model: string;
  systemPrompt: string;
  isActive: boolean;
  temperature: number;
  knowledgeBaseIds: string[];
}

export interface PromptTemplate {
  id: string;
  companyId: string;
  name: string;
  content: string;
  createdAt: Date;
}

export interface QueueConfig {
  id: string;
  companyId: string;
  name: string;
  department: string; // Legacy string or name
  departmentId?: string;
  departmentDetails?: { id: string; name: string };
  type: "MANUAL" | "ROUND_ROBIN" | "AI"; // Determines how tickets are handled
  promptTemplateId?: string;
  aiAssistantId?: string; // ID of the AI assistant assigned to this queue
  createdAt: Date;
  isActive: boolean;
}

export interface Integration {
  id: string;
  companyId: string;
  type: "whatsapp_cloud" | "instagram_graph" | "messenger";
  name: string;
  status: "connected" | "disconnected" | "pending";
  config: Record<string, unknown>;
  connectedAt?: Date;
}

export interface TableSchema {
  tableName: string;
  description: string;
  columns: {
    name: string;
    type: string;
    isPK?: boolean;
    isFK?: boolean;
    description: string;
  }[];
}

export interface AuthenticatedRequest {
  user?: { id: string; email: string; role: string };
  companyId?: string;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  headers: Record<string, unknown>;
}

export interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  status: "approved" | "rejected" | "pending";
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  subject?: string;
  createdAt: string | Date;
  components: {
    type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
    text?: string;
    format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  }[];
}

export interface CampaignStats {
  targetAudienceSize: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
}

export interface CampaignConfig {
  scheduledAt?: Date;
  messagesPerMinute: number;
  randomizeDelay: boolean;
}

export interface Campaign {
  id: string;
  companyId: string;
  name: string;
  templateId?: string;
  messageContent: string;
  targetTags: string[];
  status: "draft" | "scheduled" | "processing" | "completed";
  config: CampaignConfig;
  createdAt: Date;
  stats: CampaignStats;
  channel?: "WHATSAPP" | "EMAIL" | "SMS";
  subject?: string;
}

export type NodeType =
  | "trigger"
  // Mensajes
  | "send_message"
  | "send_image"
  | "send_video"
  | "send_audio"
  | "send_document"
  // Interaction
  | "ask_data" // Request user input
  | "condition" // Conditional branching
  | "ai_agent" // AI Agent (Gemini/OpenAI)
  // CRM Actions
  | "create_deal" // Automated deal creation
  | "update_contact" // Contact field updates
  // Assignment
  | "assign_agent" // Human agent assignment
  | "ai_handoff" // Transfer to human
  // Integrations
  | "http_request" // External API / Webhook call
  | "tag_contact" // Auto-tag contacts
  | "send_template" // WhatsApp approved templates
  // Flow Control
  | "delay" // Wait duration
  | "end" // Exit flow
  // Legacy & Extras
  | "message"
  | "input"
  | "action_task"
  | "action_calendar"
  | "action_email";

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    content?: string;
    options?: string[];
    variableName?: string;
    variable?: string;
    condition?: string; // Legacy condition value
    actionType?: string;
    // Media
    mediaUrl?: string;
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    documentUrl?: string;
    mediaAssetId?: string;
    filename?: string;
    // Logic
    operator?: string;
    value?: string;
    conditionOperator?: string;
    conditionValue?: string;
    conditionVariable?: string;
    conditions?: Array<{
      operator: string;
      value: string;
      targetHandle: string;
    }>;
    // AI
    aiAssistantId?: string;
    additionalPrompt?: string;
    handoffPrompt?: string;
    waitForUser?: boolean;
    // Assign
    assignmentType?: "agent" | "queue";
    agentId?: string;
    queueId?: string;
    message?: string; // Alternate content field
    // Delay
    delayValue?: string | number;
    delayUnit?: string;
    // Custom
    customFields?: string;
    question?: string;
    // Deal & Contact
    title?: string;
    pipelineId?: string;
    name?: string;
    email?: string;
    phone?: string;
    // HTTP Request
    webhookUrl?: string;
    url?: string;
    httpMethod?: string;
    method?: string; // standard method
    authHeader?: string;
    headers?: string; // JSON string
    bodyTemplate?: string;
    body?: string; // JSON string
    // Tag Contact
    tags?: string;
    tag?: string;
    action?: string; // 'add' | 'remove'
    // Send Template
    templateName?: string;
    templateParams?: string[];
    templateVariables?: string; // JSON string array
  };
}
export interface FlowConnection {
  id: string;
  source: string;
  target: string;
  label?: string;
}
export interface FlowTriggerConfig {
  keyword?: string;
  pattern?: string;
  event?: string;
  condition?: Record<string, unknown>;
}

export interface Flow extends BaseEntity {
  companyId: string;
  name: string;
  triggerKeyword?: string; // Deprecated, use triggerConfig
  triggerType: "KEYWORD" | "EVENT";
  triggerConfig?: FlowTriggerConfig;
  nodes: FlowNode[];
  edges: FlowConnection[];
  isActive: boolean;
}

export type WebhookEventType =
  | "message.received"
  | "message.sent"
  | "ticket.created"
  | "ticket.status_changed"
  | "ticket.assigned"
  | "contact.created"
  | "contact.updated"
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "campaign.completed"
  | "session.connected"
  | "session.disconnected"
  | "property.created"
  | "property.updated"
  | "property.published"
  | "property.status_changed"
  | "property.deleted";
export interface WebhookEndpoint {
  id: string;
  companyId: string;
  url: string;
  description?: string;
  events: WebhookEventType[];
  secretKey: string;
  isActive: boolean;
  createdAt: string;
  lastDeliveryStatus?: "success" | "failed";
  lastDeliveryTime?: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number;
  currency: string;
  stock: number;
  category: string;
  description?: string;
  imageUrl?: string;
  status: "active" | "draft" | "archived";
  type: "Physical" | "Service" | "Digital";
  createdAt: Date | string;
}

// --- ANALYTICS TYPES (Enterprise Refactor) ---
export interface HeatmapData {
  day: number; // 0-6 (Sun-Sat)
  hour: number; // 0-23
  value: number;
}

export interface AgentStats {
  agentId: string;
  name: string;
  email: string;
  totalTickets: number;
  resolvedTickets: number;
  avgResolutionTime: number; // minutes
}

export interface TagData {
  tag: string;
  count: number;
}

export type AnalyticsDateRange = "7d" | "30d" | "90d";

// ==========================================
// QUICK REPLIES
// ==========================================
export interface QuickReply {
  id: string;
  title: string;
  content: string;
  category?: string;
  shortcut?: string;
  usageCount?: number;
  tags?: string[];
  createdAt?: string;
}

export interface CreateQuickReplyDTO {
  title: string;
  content: string;
  category?: string;
  shortcut?: string;
  tags?: string[];
}

export interface UpdateQuickReplyDTO extends Partial<CreateQuickReplyDTO> {}

// ==========================================
// TICKET RESOLUTION
// ==========================================
export type ResolutionType = "SALE" | "SUPPORT" | "ADMIN" | "OTHER" | "SPAM";

export interface ResolveTicketDTO {
  status: "RESOLVED" | "CLOSED";
  resolutionType: ResolutionType;
  resolutionNotes?: string;
}

export interface TransferTicketDTO {
  assignedToId?: string | null;
  queueId?: string | null;
  status: "OPEN";
}
