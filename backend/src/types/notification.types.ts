/**
 *  NOTIFICATION SYSTEM TYPES
 * Strict contracts for alerting channels
 */

export enum NotificationType {
  // Billing & Subscription
  QUOTA_WARNING = "quota_warning",
  QUOTA_EXCEEDED = "quota_exceeded",
  TRIAL_ENDING = "trial_ending",
  SUBSCRIPTION_EXPIRING = "subscription_expiring",
  SUBSCRIPTION_EXPIRED = "subscription_expired",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_SUCCESS = "payment_success",
  PLAN_UPGRADED = "plan_upgraded",
  PLAN_DOWNGRADED = "plan_downgraded",

  // Tickets & Support
  TICKET_ASSIGNED = "ticket_assigned",
  TICKET_REPLY = "ticket_reply",
  TICKET_RESOLVED = "ticket_resolved",
  TICKET_REOPENED = "ticket_reopened",

  // Campaigns
  CAMPAIGN_STARTED = "campaign_started",
  CAMPAIGN_COMPLETED = "campaign_completed",
  CAMPAIGN_FAILED = "campaign_failed",

  // WhatsApp
  WHATSAPP_DISCONNECTED = "whatsapp_disconnected",
  WHATSAPP_CONNECTED = "whatsapp_connected",
  WHATSAPP_QR_EXPIRED = "whatsapp_qr_expired",

  // System
  BACKUP_FAILED = "backup_failed",
  STORAGE_WARNING = "storage_warning",
  INACTIVITY_WARNING = "inactivity_warning",
  SECURITY_ALERT = "security_alert",

  // Users
  NEW_USER_ADDED = "new_user_added",
  USER_REMOVED = "user_removed",
  ROLE_CHANGED = "role_changed",
}

export interface NotificationData {
  companyId: string;
  userId?: string;
  type: NotificationType;
  data: Record<string, unknown>;
}

// ️ EMAIL
export interface EmailPayload {
  companyId: string;
  to: string[]; // Strict array to match CreateEmailDTO
  from?: string;
  subject: string;
  bodyHtml: string;
  // Optional context references
  ticketId?: string;
  campaignId?: string;
  contactId?: string;
  metadata?: Record<string, string>;
}

// [APP] IN-APP
export interface InAppNotification {
  id?: string;
  userId: string;
  companyId: string;
  title: string;
  body: string;
  redirectUrl?: string;
  icon?: string;
  read: boolean;
  createdAt: Date;
}

//  PUSH
export interface PushMetadata {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

//  TEMPLATES
export type TemplateVariables = Record<string, string | number | boolean>;

// [CONTACTS] ADMIN CONTEXT (Optimized fetch)
export interface NotificationAdmin {
  id: string;
  email: string;
  name: string | null;
}
