import { Ticket, User, Queue, Conversation, Message } from "@prisma/client";

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
  assignedTo: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  } | null;

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
 * 🧠 UTILITY: JID Normalizer
 * Moved from controller to DTO for reuse
 */
const extractFromJid = (jid: string | null | undefined): string | null => {
  if (!jid) return null;
  // Remove suffixes and clean
  const clean = String(jid).replace(/@.*/, "").split(":")[0].replace(/\D/g, "");

  // 🛡️ SECURITY: Reject known bad patterns
  if (clean.startsWith("000")) return null; // DB Internal IDs
  if (clean.startsWith("40000")) return null; // Observed Bad ID

  // Relaxed validation (7-15 digits)
  return clean.length >= 7 && clean.length <= 15 ? `+${clean}` : null;
};

/**
 * DTO MAPPER
 * Transforms Prisma structure into clean TicketDTO
 */
export const toTicketDTO = (ticket: TicketWithRelations): TicketDTO => {
  // --- PHONE RESOLUTION STRATEGY ---
  let derivedPhone: string | null = null;

  // 1. Try Contact Phone
  if (ticket.createdBy?.phone) {
    derivedPhone = extractFromJid(ticket.createdBy.phone);
  }

  // 2. Fallback: Conversation Channel ID
  if (!derivedPhone && ticket.conversation?.channelId) {
    derivedPhone = extractFromJid(ticket.conversation.channelId);
  }

  // 3. Last Attempt: Contact Channel ID (Legacy)
  if (!derivedPhone && (ticket.createdBy as any)?.channelId) {
    derivedPhone = extractFromJid((ticket.createdBy as any).channelId);
  }

  // --- NAME RESOLUTION ---
  let displayName = ticket.createdBy?.name || "";
  const checkName = displayName.toLowerCase();
  const isInvalidName =
    !displayName ||
    checkName.includes("unknown") ||
    checkName.includes("sin nombre") ||
    displayName.trim() === "";

  if (isInvalidName) {
    displayName = derivedPhone || "Usuario WhatsApp";
  }

  // --- LAST MESSAGE ---
  const lastMsg = ticket.conversation?.messages?.[0];
  const lastMessageContent = lastMsg?.content || "";
  const lastMessageTime = lastMsg?.createdAt || ticket.createdAt;

  // --- BUILD CONTACT OBJECT ---
  const contact: TicketContactDTO = {
    id: ticket.createdById || "missing-user",
    name: displayName,
    email: ticket.createdBy?.email || "",
    phone: derivedPhone || "",
    channelId: ticket.conversation?.channelId || "", // Safe default
    companyId: ticket.companyId,
    avatarUrl:
      ticket.createdBy?.profilePicUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`,
    profilePicUrl: ticket.createdBy?.profilePicUrl,
    about: ticket.createdBy?.about,
    unreadCount: 0,
    status: ticket.status,
    realContactId: undefined, // Enriched later by controller if needed
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

    assignedTo: ticket.assignedTo
      ? {
          id: ticket.assignedTo.id,
          name: ticket.assignedTo.name,
          email: ticket.assignedTo.email,
          avatarUrl: ticket.assignedTo.profilePicUrl,
        }
      : null,

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
    tags: ticket.conversation?.tags || [],
  };
};
