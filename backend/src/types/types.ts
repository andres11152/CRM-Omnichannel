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
import type { ParamsDictionary } from "express-serve-static-core";
import type { ParsedQs } from "qs";

/** Tenant context attached by auth middleware */
export interface TenantContext {
  plan?: {
    features?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AuthenticatedRequest<
  P = ParamsDictionary,
  ResBody = Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqBody = any,
  ReqQuery = ParsedQs,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: NonNullable<Request["user"]>;
  companyId?: string;
  tenant?: TenantContext;
}
