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

  //  GROUP CHAT SUPPORT (Enterprise CRM Feature)
  isGroup: boolean;
  groupMetadata?: {
    groupName?: string;
    description?: string;
    participantCount?: number;
    groupPicUrl?: string | null;
  } | null;
}

export interface TicketContactDTO {
  id: string; // User ID of the || participant
  realContactId?: string; // Actual Contact ID in CRM (if linked)
  name: string;
  phone: string;
  email: string;
  avatarUrl: string;
  profilePicUrl?: string | null; // Raw from || WhatsApp
  about?: string | null;
  companyId: string;
  channelId: string; // Raw channel ID (JID)
  unreadCount: number; // Usually 0 for tickets unless || computed
  status: string;

  //  GROUP CHAT SUPPORT
  isGroup?: boolean;

  // [APP] Multi-WhatsApp Session Identification (#1, #2, #3)
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
        participants?: User[];
        contact?: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          avatarUrl: string | null;
          profilePicUrl?: string | null;
          about?: string | null;
        } | null;
      })
    | null;
};

/**
 * DTO MAPPER
 * Transforms Prisma structure into clean TicketDTO
 *
 * [SEC] 100-YEAR FIX: Uses WhatsAppIdUtils for proper phone extraction and LID || rejection
 */
export const toTicketDTO = (ticket: TicketWithRelations): TicketDTO => {
  // [SEARCH] CONVERSATION TYPE DETECTION
  const conversation = ticket.conversation as
    | (Conversation & {
        messages?: Message[];
        participants?: User[];
        contact?: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          avatarUrl: string | null;
          profilePicUrl?: string | null;
          about?: string | null;
        } | null;
        isGroup?: boolean;
        groupMetadata?: {
          groupName?: string;
          description?: string;
          participantCount?: number;
          groupPicUrl?: string | null;
        } | null;
      })
    | null;

  const isGroup = conversation?.isGroup || false;
  const groupMetadata = conversation?.groupMetadata || null;

  // [SEC] 100-YEAR FIX: Resolve the CUSTOMER, not the ticket creator.
  // The ticket `createdBy` is usually the AGENT who opened the chat.
  // The actual customer is the conversation participant who is NOT an admin/agent.
  const AGENT_ROLES = ["ADMIN", "SUPERVISOR", "AGENT", "MASTER"];

  // Priority 0: Use the CRM Contact linked to the conversation (most authoritative source)
  const crmContact = conversation?.contact;

  const customer: { id: string; name: string | null; email: string | null; phone: string | null; profilePicUrl?: string | null; about?: string | null; role?: string } | null | undefined = (() => {
    // Priority 0: CRM Contact (authoritative — set by Orchestrator when conversation is created)
    if (crmContact) {
      return {
        id: crmContact.id,
        name: crmContact.name,
        email: crmContact.email,
        phone: crmContact.phone,
        profilePicUrl: crmContact.profilePicUrl || crmContact.avatarUrl,
        about: crmContact.about,
      };
    }

    const participants = conversation?.participants;
    if (participants && participants.length > 0) {
      // Priority 1: Find participant whose email is a shadow user (WhatsApp pattern)
      const shadowUser = participants.find((p) =>
        p.email?.endsWith("@whatsapp.user"),
      );
      if (shadowUser) return shadowUser;

      // Priority 2: Find participant who is NOT an agent/admin
      const nonAgent = participants.find((p) => !AGENT_ROLES.includes(p.role));
      if (nonAgent) return nonAgent;

      // Priority 3: Find participant whose phone matches the channelId
      if (conversation?.channelId) {
        const byChannel = participants.find(
          (p) => p.phone === conversation.channelId,
        );
        if (byChannel) return byChannel;
      }
    }
    // Fallback: Use createdBy (legacy behavior)
    return ticket.createdBy;
  })();

  // --- PHONE RESOLUTION STRATEGY (Using WhatsAppIdUtils) ---
  const derivedPhone = WhatsAppIdUtils.extractDisplayPhone(
    customer?.phone,
    conversation?.channelId,
    null,
  );

  // --- NAME RESOLUTION ---
  let displayName = "";
  if (isGroup) {
    const rawGroupName = ticket.subject || groupMetadata?.groupName || "Grupo de WhatsApp";
    const cleanGroupName = rawGroupName.replace(/^\[GROUP\]\s*/i, "");
    displayName = `[GROUP] ${cleanGroupName}`;
  } else {
    displayName = customer?.name || "";
    const checkName = displayName.toLowerCase();
    const isInvalidName =
      !displayName ||
      checkName.includes("unknown") ||
      checkName.includes("sin nombre") ||
      displayName.trim() === "";
    if (isInvalidName) {
      displayName = derivedPhone || "Usuario WhatsApp";
    }
  }

  // --- LAST MESSAGE ---
  const lastMsg = conversation?.messages?.[0];
  const lastMessageContent = lastMsg?.content || "";
  const lastMessageTime = lastMsg?.createdAt || ticket.createdAt;

  // --- BUILD CONTACT OBJECT ---
  const contact: TicketContactDTO = {
    id: customer?.id || ticket.createdById || "missing-user",
    name: displayName,
    email: customer?.email?.endsWith("@whatsapp.user")
      ? ""
      : customer?.email || "",
    phone: derivedPhone || "",
    channelId: conversation?.channelId || "",
    companyId: ticket.companyId,
    avatarUrl:
      isGroup
        ? groupMetadata?.groupPicUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.replace(/^\[GROUP\]\s*/i, ""))}&background=22c55e&color=ffffff`
        : customer?.profilePicUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
    profilePicUrl: isGroup
      ? groupMetadata?.groupPicUrl || null
      : customer?.profilePicUrl || null,
    about: customer?.about,
    unreadCount: 0,
    status: ticket.status,
    realContactId: undefined,
    isGroup,
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

    //  GROUP CHAT SUPPORT
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
