import { Ticket, User, Queue, Conversation, Message } from "@prisma/client";
import { WhatsAppIdUtils } from "../whatsapp/utils/WhatsAppIdUtils";

export interface TicketDTO {
  id: string;
  ticketNumber: number;
  subject: string | null;
  description: string | null;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;

  // Clean relational objects
  assignedToId: string | null;
  assignedTo: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  } | null;

  queueId: string | null;
  queue: {
    id: string;
    name: string;
  } | null;

  // Unified Contact View (Frontend expects this structure)
  contact: TicketContactDTO;

  // Metadata
  conversationId: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  channel: string;
  tags: string[];

  // 🏢 GROUP CHAT SUPPORT (Enterprise CRM Feature)
  isGroup: boolean;
  groupMetadata?: {
    groupName?: string;
    description?: string;
    participantCount?: number;
    groupPicUrl?: string | null;
  } | null;
}

export interface TicketContactDTO {
  id: string; // User ID of the participant
  realContactId?: string; // Actual Contact ID in CRM (if linked)
  name: string;
  phone: string;
  email: string;
  avatarUrl: string;
  profilePicUrl?: string | null; // Raw from WhatsApp
  about?: string | null;
  companyId: string;
  channelId: string; // Raw channel ID (JID)
  unreadCount: number; // Usually 0 for tickets unless computed
  status: string;

  // 🏢 GROUP CHAT SUPPORT
  isGroup?: boolean;

  // 📱 Multi-WhatsApp Session Identification (#1, #2, #3)
  whatsappSessionIndex?: number;
  whatsappSessionPhone?: string;
}

// Type that includes everything needed for mapping
export type TicketWithRelations = Ticket & {
  createdBy?: User | null;
  assignedTo?: User | null;
  queue?: Queue | null;
  conversation?:
    | (Conversation & {
        messages?: Message[];
      })
    | null;
};

/**
 * DTO MAPPER
 * Transforms Prisma structure into clean TicketDTO
 *
 * 🛡️ 100-YEAR FIX: Uses WhatsAppIdUtils for proper phone extraction and LID rejection
 */
export const toTicketDTO = (ticket: TicketWithRelations): TicketDTO => {
  // 🔍 CONVERSATION TYPE DETECTION
  // Access isGroup from conversation (will be available after Prisma migration)
  const conversation = ticket.conversation as
    | (Conversation & {
        messages?: Message[];
        isGroup?: boolean;
        groupMetadata?: {
          groupName?: string;
          description?: string;
          participantCount?: number;
          groupPicUrl?: string | null;
        } | null;
      })
    | null;

  const isGroup = conversation?.isGroup ?? false;
  const groupMetadata = conversation?.groupMetadata ?? null;

  // --- PHONE RESOLUTION STRATEGY (Using WhatsAppIdUtils) ---
  const derivedPhone = WhatsAppIdUtils.extractDisplayPhone(
    ticket.createdBy?.phone,
    conversation?.channelId,
    null, // No secondary channel fallback needed
  );

  // --- NAME RESOLUTION ---
  let displayName = ticket.createdBy?.name || "";
  const checkName = displayName.toLowerCase();
  const isInvalidName =
    !displayName ||
    checkName.includes("unknown") ||
    checkName.includes("sin nombre") ||
    displayName.trim() === "";

  // For groups, prioritize group name from metadata
  if (isGroup && groupMetadata?.groupName) {
    displayName = `📢 ${groupMetadata.groupName}`;
  } else if (isInvalidName) {
    displayName = derivedPhone || "Usuario WhatsApp";
  }

  // --- LAST MESSAGE ---
  const lastMsg = conversation?.messages?.[0];
  const lastMessageContent = lastMsg?.content || "";
  const lastMessageTime = lastMsg?.createdAt || ticket.createdAt;

  // --- BUILD CONTACT OBJECT ---
  const contact: TicketContactDTO = {
    id: ticket.createdById || "missing-user",
    name: displayName,
    email: ticket.createdBy?.email || "",
    phone: derivedPhone || "",
    channelId: conversation?.channelId || "", // Safe default
    companyId: ticket.companyId,
    avatarUrl:
      (isGroup && groupMetadata?.groupPicUrl) ||
      ticket.createdBy?.profilePicUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=${isGroup ? "22c55e" : "random"}`,
    profilePicUrl: isGroup
      ? groupMetadata?.groupPicUrl
      : ticket.createdBy?.profilePicUrl,
    about: ticket.createdBy?.about,
    unreadCount: 0,
    status: ticket.status,
    realContactId: undefined, // Enriched later by controller if needed
    isGroup, // 🏢 Pass group flag to frontend
  };

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,

    assignedToId: ticket.assignedToId,
    assignedTo: ticket.assignedTo
      ? {
          id: ticket.assignedTo.id,
          name: ticket.assignedTo.name,
          email: ticket.assignedTo.email,
          avatarUrl: ticket.assignedTo.profilePicUrl,
        }
      : null,

    queueId: ticket.queueId,
    queue: ticket.queue
      ? {
          id: ticket.queue.id,
          name: ticket.queue.name,
        }
      : null,

    contact,

    conversationId: ticket.conversationId,
    lastMessage: lastMessageContent,
    lastMessageAt: lastMessageTime,
    channel: "WhatsApp",
    tags: conversation?.tags || [],

    // 🏢 GROUP CHAT SUPPORT
    isGroup,
    groupMetadata: groupMetadata
      ? {
          groupName: groupMetadata.groupName,
          description: groupMetadata.description,
          participantCount: groupMetadata.participantCount,
          groupPicUrl: groupMetadata.groupPicUrl,
        }
      : null,
  };
};
