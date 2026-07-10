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
  // Direction of the last message — lets the UI distinguish "customer is
  // waiting for a reply" (INBOUND) from "we already answered" (OUTBOUND),
  // instead of treating every ticket as perpetually awaiting response.
  lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
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

  const crmContact = conversation?.contact;

  // A name is only usable if it's a real WhatsApp display name — not a placeholder
  // ("Usuario WhatsApp"), not "unknown", and not a bare phone number.
  const isUsableName = (n?: string | null): boolean => {
    if (!n) return false;
    const x = n.toLowerCase().trim();
    if (!x) return false;
    if (
      x.includes("unknown") ||
      x.includes("sin nombre") ||
      x.includes("usuario whatsapp") ||
      x.includes("usuario de whatsapp")
    )
      return false;
    if (/^\+?\d[\d\s-]*$/.test(x)) return false; // bare phone number
    return true;
  };

  // The real WhatsApp identity lives on the shadow-user participant (pushName + profile
  // pic, set by the Baileys orchestrator). The CRM Contact can be stale (e.g. created with
  // a "Usuario WhatsApp" placeholder before the name/pic resolved). So we MERGE both,
  // preferring a usable name and any available picture, instead of letting a stale CRM
  // Contact override the good live data.
  const participant: (Partial<User> & { about?: string | null }) | null = (() => {
    const ps = conversation?.participants;
    if (!ps || ps.length === 0) return null;
    return (
      ps.find((p) => p.email?.endsWith("@whatsapp.user")) ||
      ps.find((p) => !AGENT_ROLES.includes(p.role)) ||
      (conversation?.channelId
        ? ps.find((p) => p.phone === conversation.channelId)
        : undefined) ||
      null
    );
  })();

  const customer:
    | { id: string; name: string | null; email: string | null; phone: string | null; profilePicUrl?: string | null; about?: string | null; role?: string }
    | null
    | undefined = crmContact || participant
    ? {
        id: crmContact?.id || participant?.id || ticket.createdById || "missing-user",
        // Prefer whichever side has a real human name.
        name:
          [crmContact?.name, participant?.name].find(isUsableName) ||
          crmContact?.name ||
          participant?.name ||
          null,
        email: crmContact?.email ?? participant?.email ?? null,
        phone: crmContact?.phone || participant?.phone || null,
        // Prefer any non-null picture from either source.
        profilePicUrl:
          crmContact?.profilePicUrl ||
          crmContact?.avatarUrl ||
          participant?.profilePicUrl ||
          null,
        about: crmContact?.about ?? participant?.about ?? null,
        role: participant?.role,
      }
    : ticket.createdBy;

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
    if (!isUsableName(displayName)) {
      displayName = derivedPhone || "Usuario WhatsApp";
    }
  }

  // Profile pics are stored as relative storage paths (e.g. "companies/.../uploads/x.jpg").
  // The frontend serves them from the backend, which expects a leading "/". Normalize so the
  // path resolves correctly (leave absolute http(s) URLs and ui-avatars untouched).
  const normalizePic = (u?: string | null): string | null => {
    if (!u) return null;
    if (u.startsWith("http") || u.startsWith("/")) return u;
    return `/${u}`;
  };
  const customerPic = normalizePic(customer?.profilePicUrl);

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
        ? normalizePic(groupMetadata?.groupPicUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.replace(/^\[GROUP\]\s*/i, ""))}&background=22c55e&color=ffffff`
        : customerPic || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
    profilePicUrl: isGroup
      ? normalizePic(groupMetadata?.groupPicUrl)
      : customerPic,
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
    lastMessageDirection: (lastMsg?.direction as "INBOUND" | "OUTBOUND" | undefined) ?? null,
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
