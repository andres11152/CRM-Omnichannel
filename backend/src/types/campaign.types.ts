import { Campaign, MessageTemplate } from "@prisma/client";

/**
 * [PKG] CAMPAIGN INTERFACES
 * Strict contracts for campaign execution engine
 */

export interface CampaignStats {
  targetAudienceSize: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  startedAt: string;
  completedAt?: string;
  successRate?: string;
  error?: string;
  failedAt?: string;
  message?: string; // For status messages like "No contacts found"
}

// Campaign with typed stats (Prisma stats is Json)
export interface TypedCampaign extends Omit<Campaign, "stats" | "config"> {
  stats: CampaignStats | null;
  config: Record<string, unknown> | null;
}

// Optimized Audience Contact (only what's needed for sending)
export interface AudienceContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  customFields?: Record<string, unknown>; // For personalization
}

// Execution Payload
export interface CampaignExecutionPayload {
  campaign: TypedCampaign;
  template: MessageTemplate | null;
  contacts: AudienceContact[];
}

// Service Filter type
export interface AudienceFilter {
  companyId: string;
  phone?: { not: null };
  email?: { not: null };
  emailOptOut?: false;
  deletedAt: null;
  tags?: { hasSome: string[] };
}
