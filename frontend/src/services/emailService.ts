import { api } from "@/lib/axios";

// ===================================
// EMAIL SERVICE
// ===================================

export interface SendEmailDTO {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  replyTo?: string;
  contactId?: string;
  ticketId?: string;
  enableTracking?: boolean;
}

export interface Email {
  id: string;
  messageId?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  status: string;
  type: "INBOUND" | "OUTBOUND";
  contactId?: string;
  ticketId?: string;
  sentAt?: string;
  createdAt: string;
}

export interface TimelineActivity {
  id: string;
  type: "email" | "whatsapp_message";
  timestamp: string;
  direction: "inbound" | "outbound";
  content: string;
  subject?: string;
  channel: "EMAIL" | "WHATSAPP";
  status: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send an email
 */
export async function sendEmail(data: SendEmailDTO): Promise<Email> {
  const res = await api.post("/emails/send", data);
  return res.data.data.email;
}

/**
 * Get emails by contact
 */
export async function getEmailsByContact(contactId: string): Promise<Email[]> {
  const res = await api.get(`/emails/contact/${contactId}`);
  return res.data.data.emails;
}

/**
 * Get emails by ticket
 */
export async function getEmailsByTicket(ticketId: string): Promise<Email[]> {
  const res = await api.get(`/emails/ticket/${ticketId}`);
  return res.data.data.emails;
}

/**
 * Get unified timeline (WhatsApp + Email)
 */
export async function getTimeline(params: {
  contactId?: string;
  ticketId?: string;
  limit?: number;
  offset?: number;
}): Promise<TimelineActivity[]> {
  const queryParams = new URLSearchParams();
  if (params.contactId) queryParams.append("contactId", params.contactId);
  if (params.ticketId) queryParams.append("ticketId", params.ticketId);
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.offset) queryParams.append("offset", params.offset.toString());

  const res = await api.get(`/emails/timeline?${queryParams.toString()}`);
  return res.data.data.timeline;
}

/**
 * Get timeline stats for a contact
 */
export async function getTimelineStats(contactId: string) {
  const res = await api.get(`/emails/timeline/${contactId}/stats`);
  return res.data.data.stats;
}
