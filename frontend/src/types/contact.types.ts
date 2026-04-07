import { BaseEntity } from "./common.types";

/**
 * [CONTACTS] Contact & CRM Types
 */

export type ContactType = "LEAD" | "CUSTOMER" | "PARTNER";
export type ContactStatus = "ACTIVE" | "ARCHIVED" | "BLOCKED";
import { Channel } from "../types";

export interface Tag extends BaseEntity {
  name: string;
  color: string; // Tailwind class e.g., 'bg-red-500 text-white'
  companyId: string;
}

export interface Contact extends BaseEntity {
  companyId: string;
  name: string;
  phone?: string; // Optional (might create with email only)
  email?: string; // Optional

  type: ContactType;
  status: ContactStatus;
  channel?: Channel;

  // Arrays & JSON
  tags: string[];
  customFields: Record<string, unknown>; // 100-Year: No `any`

  // Metrics
  lastInteractionAt?: string;
  ltv?: number; // Lifetime Value

  avatarUrl: string;
  notes?: string;

  //  Enterprise Fields (Runtime Enrichment)
  isGroup?: boolean;
  profilePicUrl?: string;
  channelId?: string;
  about?: string;
  realContactId?: string;
  whatsappSessionIndex?: number; // [APP] Multi-WhatsApp Session Identification (#1, #2, #3)
  whatsappSessionPhone?: string; // [PHONE] Phone number for tooltip

  // Runtime UI State
  lastMessage: string;
  lastMessageTime: Date | string;
  unreadCount?: number;
  assignedMode?: "bot" | "human";
  queueName?: string;
  assignedAgentName?: string;
  assignedToId?: string | null;
  ticketId?: string;
}

// For Forms/Creation
export interface CreateContactDTO {
  name: string;
  phone?: string;
  email?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

// Stats/Summary
export interface ContactMetrics {
  totalContacts: number;
  newLeadsToday: number;
  activeConversations: number;
}
