// Define channel types
import {
  User as AuthUser,
  Company as AuthCompany,
  CompanyStatus as AuthCompanyStatus,
} from "./src/types/auth.types";
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
}

export interface Message {
  id: string;
  ticketId: string;
  companyId: string;
  content: string;
  senderType: SenderType;
  timestamp: Date;
  senderName?: string;
  attachment?: {
    id: string;
    type:
      | "image"
      | "video"
      | "file"
      | "audio"
      | "sticker"
      | "location"
      | "contact"
      | "contact_list";
    url: string;
    name?: string;
    mimeType?: string;
    isPrivate?: boolean;
  };
  direction?: "INBOUND" | "OUTBOUND";
  status?:
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "pending"
    | "scheduled"
    | "SCHEDULED";
  metadata?: any;
}

// SIMPLIFIED: Represents the person, not the conversation
export interface Contact {
  id: string;
  ticketId?: string; // ID del ticket asociado (si existe) para operaciones de resolución
  realContactId?: string; // ID real en la tabla contacts
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  avatarUrl: string;
  // Fix: Add properties for conversation summary to resolve type errors in multiple components
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  tags: string[];
  notes?: string;
  channel: Channel;
  assignedMode: "human" | "bot";
  // FIXED: Removed 'PENDING' to match Prisma ConversationStatus
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  queueName?: string;
  assignedAgentName?: string;
  channelId?: string;
  profilePicUrl?: string; // WhatsApp Profile Picture URL
  about?: string; // WhatsApp Status/About
  // 🏢 GROUP CHAT SUPPORT
  isGroup?: boolean;
  // 📱 Multi-WhatsApp Session Identification (#1, #2, #3)
  whatsappSessionIndex?: number;
  whatsappSessionPhone?: string;
}

// NEW: Represents the conversation/case
export interface Conversation {
  id: string;
  companyId: string;
  channel: Channel;
  ticketId?: string;
  contactId?: string;
  status: "OPEN" | "CLOSED" | "PENDING" | "RESOLVED";
  unreadCount: number;
  lastMessage?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  // 🏢 GROUP CHAT SUPPORT
  isGroup?: boolean;
  // 📱 Multi-WhatsApp Session Identification (#1, #2, #3)
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
  createdAt: string; // ISO Date
  updatedAt: string;
  resolvedAt?: string | null;

  channel: string;
  tags: string[];
  conversationId: string | null;

  // Legacy fields for compatibility (can be optional)
  queueId?: string | null;
  assignedToId?: string | null;

  // 🏢 GROUP CHAT SUPPORT (Enterprise CRM Feature)
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
  config: Record<string, any>;
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
  body: any;
  query: any;
  params: any;
  headers: any;
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
  // Interacción
  | "ask_data" // Solicitar datos del usuario (INPUT)
  | "condition" // Condición / Branching
  | "ai_agent" // Agente IA (OpenAI/Gemini)
  // Acciones CRM
  | "create_deal" // Crear deal automáticamente
  | "update_contact" // Actualizar campos del contacto
  // Asignación
  | "assign_agent" // Asignar a agente humano
  | "ai_handoff" // Transferir a humano
  // Control de flujo
  | "delay" // Esperar X tiempo
  | "end" // Fin del flujo
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
    // AI
    aiAssistantId?: string;
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
  };
}
export interface FlowConnection {
  id: string;
  source: string;
  target: string;
  label?: string;
}
export interface Flow {
  id: string;
  companyId: string;
  name: string;
  triggerKeyword?: string; // Deprecated, use triggerConfig
  triggerType: "KEYWORD" | "EVENT";
  triggerConfig?: {
    keyword?: string;
    event?: string; // e.g. "DEAL_UPDATED"
    condition?: any;
  };
  nodes: FlowNode[];
  edges: FlowConnection[];
  isActive: boolean;
}

export type WebhookEventType =
  | "message.received"
  | "message.sent"
  | "ticket.created"
  | "ticket.status_changed";
export interface WebhookEndpoint {
  id: string;
  companyId: string;
  url: string;
  description: string;
  events: WebhookEventType[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  lastDeliveryStatus?: "success" | "failed";
  lastDeliveryTime?: Date;
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
  status: "RESOLVED";
  resolutionType: ResolutionType;
  resolutionNotes?: string;
}

export interface TransferTicketDTO {
  assignedToId?: string | null;
  queueId?: string | null;
  status: "OPEN";
}
