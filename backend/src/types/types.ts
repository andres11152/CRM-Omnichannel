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

export interface AuthenticatedRequest<
  P = import("express-serve-static-core").ParamsDictionary,
  ResBody = any,
  ReqBody = Record<string, any>,
  ReqQuery = import("express-serve-static-core").Query,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: NonNullable<Request["user"]>;
  companyId?: string;
}
