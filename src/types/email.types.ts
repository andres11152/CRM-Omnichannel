import { EmailStatus, EmailType } from "@prisma/client";

// ===================================
// EMAIL PROVIDER INTERFACES
// ===================================

export interface IEmailProvider {
  /**
   * Send an email through the provider
   */
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Parse incoming webhook from provider
   */
  parseWebhook(body: any, headers: any): WebhookEvent | null;

  /**
   * Verify webhook signature (security)
   */
  verifyWebhookSignature(body: any, signature: string): boolean;
}

export interface SendEmailParams {
  from: string;
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: EmailAttachment[];

  // Tracking
  enableTracking?: boolean; // Open/click tracking

  // Custom headers
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string; // Provider's message ID
  error?: string;
}

export interface EmailAttachment {
  filename: string;
  content?: Buffer | string; // Base64 or Buffer
  path?: string; // URL or file path
  contentType?: string;
}

// ===================================
// WEBHOOK EVENTS
// ===================================

export enum WebhookEventType {
  DELIVERED = "delivered",
  OPENED = "opened",
  CLICKED = "clicked",
  BOUNCED = "bounced",
  SPAM = "spam",
  FAILED = "failed",
}

export interface WebhookEvent {
  messageId: string;
  eventType: WebhookEventType;
  timestamp: Date;
  metadata?: any;
}

// ===================================
// TIMELINE UNIFIED INTERFACE
// ===================================

export enum TimelineActivityType {
  WHATSAPP_MESSAGE = "whatsapp_message",
  EMAIL = "email",
  PHONE_CALL = "phone_call",
  MEETING = "meeting",
  NOTE = "note",
}

export interface TimelineActivity {
  id: string;
  type: TimelineActivityType;
  timestamp: Date;

  // Common fields
  direction?: "inbound" | "outbound";
  content: string;
  subject?: string;

  // Specific fields
  channel?: "WHATSAPP" | "EMAIL" | "SMS";
  status?: string;

  // Relations
  contactId?: string;
  ticketId?: string;

  // Provider-specific metadata
  metadata?: any;
}

// ===================================
// SERVICE DTOs
// ===================================

export interface CreateEmailDTO {
  companyId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  replyTo?: string;

  // Relations
  contactId?: string;
  ticketId?: string;

  // Attachments
  attachments?: EmailAttachment[];

  // Tracking
  enableTracking?: boolean;
}

export interface UpdateEmailStatusDTO {
  messageId: string;
  status: EmailStatus;
  errorMessage?: string;
  openedAt?: Date;
  clickedAt?: Date;
}

export interface GetTimelineParams {
  contactId?: string;
  ticketId?: string;
  companyId: string;
  limit?: number;
  offset?: number;
  types?: TimelineActivityType[];
}
