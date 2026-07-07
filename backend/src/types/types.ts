import type {} from "./express";
import { Request } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import type { ParsedQs } from "qs";

// ────────────────────────────────────────────────
// ENUMS (Domain Mirror of Prisma Enums)
// Eliminates ORM Leakage: Controllers import these, never @prisma/client.
// ────────────────────────────────────────────────

export enum UserRole {
  USER = "USER",
  AGENT = "AGENT",
  SUPERVISOR = "SUPERVISOR",
  ADMIN = "ADMIN",
  MASTER = "MASTER",
}

export enum CompanyStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  TRIAL = "TRIAL",
  OVERDUE = "OVERDUE",
  CANCELED = "CANCELED",
  BANNED = "BANNED",
}

export enum TicketStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum TicketPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum TicketResolutionType {
  SALE = "SALE",
  SUPPORT = "SUPPORT",
  ADMIN = "ADMIN",
  OTHER = "OTHER",
  SPAM = "SPAM",
}

export enum Channel {
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
  WEB_CHAT = "WEB_CHAT",
  TELEGRAM = "TELEGRAM",
  FACEBOOK_MESSENGER = "FACEBOOK_MESSENGER",
  INSTAGRAM_DM = "INSTAGRAM_DM",
}

export enum MessageDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum ConversationStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum MediaType {
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  DOCUMENT = "DOCUMENT",
}

export enum SenderType {
  USER = "USER",
  AGENT = "AGENT",
  BOT = "BOT",
}

export enum QueueType {
  MANUAL = "MANUAL",
  ROUND_ROBIN = "ROUND_ROBIN",
  AI = "AI",
}

export enum ActivityType {
  NOTE = "NOTE",
  CALL = "CALL",
  EMAIL = "EMAIL",
  MEETING = "MEETING",
  TASK = "TASK",
}

// ────────────────────────────────────────────────
// WEBHOOKS
// ────────────────────────────────────────────────

export enum WebhookEvents {
  MESSAGE_RECEIVED = "message.received",
  MESSAGE_SENT = "message.sent",
  TICKET_CREATED = "ticket.created",
  TICKET_STATUS_CHANGED = "ticket.status_changed",
  TICKET_ASSIGNED = "ticket.assigned",
  CONTACT_CREATED = "contact.created",
  CONTACT_UPDATED = "contact.updated",
  DEAL_CREATED = "deal.created",
  DEAL_STAGE_CHANGED = "deal.stage_changed",
  DEAL_WON = "deal.won",
  DEAL_LOST = "deal.lost",
  CAMPAIGN_COMPLETED = "campaign.completed",
  SESSION_CONNECTED = "session.connected",
  SESSION_DISCONNECTED = "session.disconnected",
  PROPERTY_CREATED = "property.created",
  PROPERTY_UPDATED = "property.updated",
  PROPERTY_PUBLISHED = "property.published",
  PROPERTY_STATUS_CHANGED = "property.status_changed",
  PROPERTY_DELETED = "property.deleted",
}

export interface Webhook {
  id: string;
  companyId: string;
  url: string;
  events: WebhookEvents[];
  isActive: boolean;
  secretKey: string;
}

// ────────────────────────────────────────────────
// AUTHENTICATION & MULTI-TENANCY
// ────────────────────────────────────────────────

/** Tenant context attached by auth middleware */
export interface TenantContext {
  plan?: {
    features?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

/**
 * AuthenticatedRequest
 * 
 * Central request type for the CRM.
 * `user` uses Express's augmented User type from passport/auth middleware,
 * which includes id, email, role, companyId, and additional fields
 * (preferences, phone, about, profilePicUrl, scopes, apiKeyId).
 */
export interface AuthenticatedRequest<
  P = ParamsDictionary,
  ResBody = unknown,
  ReqBody = { [key: string]: never },
  ReqQuery = ParsedQs,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: NonNullable<Request["user"]>;
  companyId?: string;
  tenant?: TenantContext;
}

