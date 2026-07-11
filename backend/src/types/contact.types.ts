import { Contact } from "@prisma/client";

/**
 * [PKG] CONTACT DTOs
 * Decoupled data transfer objects for frontend communication
 */

export interface ContactDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  tags: string[];
  notes: string | null;
  customFields: Record<string, unknown>;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineItemDTO {
  type: "DEAL" | "ACTIVITY" | "TICKET" | "CONVERSATION";
  id: string;
  date: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  metadata?: Record<string, unknown>;
}

export interface ContactTimelineResponseDTO {
  contact: ContactDTO;
  timeline: TimelineItemDTO[];
}

/**
 * [SYNC] MAPPERS
 */
export const toContactDTO = (contact: Contact): ContactDTO => {
  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    avatarUrl: contact.avatarUrl,
    tags: contact.tags,
    notes: contact.notes,
    customFields: (contact.customFields as Record<string, unknown>) || {},
    isBlocked: contact.isBlocked,
    blockedAt: contact.blockedAt ? contact.blockedAt.toISOString() : null,
    blockedReason: contact.blockedReason,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
};
