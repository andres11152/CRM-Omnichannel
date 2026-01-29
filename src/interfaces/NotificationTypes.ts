/**
 * 🔔 NOTIFICATION SYSTEM TYPES
 * Strict contracts for alerting channels
 */

// ✉️ EMAIL
export interface EmailPayload {
  companyId: string;
  to: string | string[]; // Support single or multiple recipients
  from?: string;
  subject: string;
  bodyHtml: string;
  // Optional context references
  ticketId?: string;
  campaignId?: string;
  metadata?: Record<string, string>;
}

// 📱 IN-APP
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

// 📲 PUSH
export interface PushMetadata {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

// 📄 TEMPLATES
export type TemplateVariables = Record<string, string | number | boolean>;

// 👥 ADMIN CONTEXT (Optimized fetch)
export interface NotificationAdmin {
  id: string;
  email: string;
  name: string | null;
}
