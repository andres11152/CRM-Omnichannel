export enum SenderType {
  USER = "USER",
  AGENT = "AGENT",
  BOT = "BOT",
}

export enum WebhookEvents {
  MESSAGE_RECEIVED = "message.received",
  MESSAGE_SENT = "message.sent",
  STATUS_UPDATED = "status.updated",
  CONTACT_CREATED = "contact.created",
}

export interface Webhook {
  id: string;
  companyId: string;
  url: string;
  events: WebhookEvents[];
  isActive: boolean;
  secretKey: string;
}

// Authenticated request type for controllers that require `req.user`
import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    name?: string | null;
    role?: string;
    companyId?: string;
  };
  companyId?: string;
  file?: any;
  files?: any;
}
