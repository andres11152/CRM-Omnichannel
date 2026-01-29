import { BaseEntity } from "./common.types";

/**
 * 👥 Contact & CRM Types
 */

export type ContactType = "LEAD" | "CUSTOMER" | "PARTNER";
export type ContactStatus = "ACTIVE" | "ARCHIVED" | "BLOCKED";
export type Channel = "WHATSAPP" | "EMAIL" | "SMS" | "INSTAGRAM";

export interface Contact extends BaseEntity {
  companyId: string;
  name: string;
  phone?: string; // Optional (might create with email only)
  email?: string; // Optional

  type: ContactType;
  status: ContactStatus;

  // Arrays & JSON
  tags: string[];
  customFields: Record<string, any>; // JSON

  // Metrics
  lastInteractionAt?: string;
  ltv?: number; // Lifetime Value

  avatarUrl?: string;
  notes?: string;
}

// For Forms/Creation
export interface CreateContactDTO {
  name: string;
  phone?: string;
  email?: string;
  tags?: string[];
  customFields?: Record<string, any>;
}

// Stats/Summary
export interface ContactMetrics {
  totalContacts: number;
  newLeadsToday: number;
  activeConversations: number;
}
