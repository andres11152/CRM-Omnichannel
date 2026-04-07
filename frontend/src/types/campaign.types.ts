import { BaseEntity } from "./common.types";

/**
 * [CA] Marketing & Campaigns Types
 */

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED";
export type CampaignType = "BROADCAST" | "SEQUENCE" | "TRIGGERED";

export interface Campaign extends BaseEntity {
  companyId: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;

  // Scheduling
  scheduledAt?: string; // ISO Date

  // Content & Config
  templateId?: string;
  messageBody?: string; // If no template

  // Audience (JSON in DB)
  audienceFilters: AudienceFilters;

  // Stats (JSON in DB)
  stats: CampaignStats;

  createdBy: string; // UserId
}

export interface AudienceFilters {
  tags?: string[];
  segments?: string[];
  excludeTags?: string[];
  customRules?: Record<string, unknown>;
}

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  clicks?: number;
}

// --- TEMPLATES ---

export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED";
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTH";

export interface WhatsAppTemplate extends BaseEntity {
  companyId: string;
  name: string; // e.g., "welcome_offer_2024"
  language: string; // "es", "en"
  category: TemplateCategory;
  status: TemplateStatus;

  components: TemplateComponent[]; // Structure from WA API
  variables: string[]; // Extracted vars {{1}}, {{name}}
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: {
    type: string;
    text?: string;
    url?: string;
    phoneNumber?: string;
  }[];
}
