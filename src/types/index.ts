export enum SenderType {
  USER = "USER",
  AGENT = "AGENT",
  BOT = "BOT",
}

export enum Channel {
  WHATSAPP = "whatsapp",
  MESSENGER = "messenger",
  INSTAGRAM = "instagram",
  WEB = "web",
}

export interface UploadResult {
  url: string;
  key: string;
  provider: "s3" | "local";
}

export type CompanyStatus = "active" | "trial" | "overdue" | "canceled";

export interface Company {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  planId: string;
  status: CompanyStatus;
  isActive: boolean;
  createdAt: Date;
  subscriptionEndsAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  config: {
    max_users: number;
    max_queues: number;
    max_whatsapp_connections: number;
  };
}

// --- Definiciones de Webhooks (Lo que te faltaba) ---
export type WebhookEventType =
  | "message.received"
  | "message.sent"
  | "ticket.updated"
  | "contact.created"
  | "system.device_connected"
  | "system.device_disconnected"
  | "system.connection_restored"
  | "system.reconnecting";

export interface Webhook {
  id: string;
  companyId: string;
  url: string;
  events: WebhookEventType[];
  isActive: boolean;
  secretKey: string;
}

// Request type used in controllers after authentication middleware
import { Request } from "express";
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
    companyId?: string;
  };
  companyId?: string | null;
}
