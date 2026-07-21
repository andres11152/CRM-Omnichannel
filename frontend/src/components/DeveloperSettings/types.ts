import { toast } from "sonner";
import { WebhookEventType } from "@/types";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface DeliveryLog {
  id: string;
  webhookId: string;
  status: number;
  eventType: string;
  url: string;
  createdAt: string;
  duration: number;
  error?: string;
  attempt: number;
}

export const AVAILABLE_EVENTS: WebhookEventType[] = [
  "message.received",
  "message.sent",
  "ticket.created",
  "ticket.status_changed",
  "ticket.assigned",
  "contact.created",
  "contact.updated",
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "campaign.completed",
  "session.connected",
  "session.disconnected",
  "property.created",
  "property.updated",
  "property.published",
  "property.status_changed",
  "property.deleted",
];

export const copyToClipboard = (text: string, label = "Copiado") => {
  navigator.clipboard.writeText(text).then(() => toast.success(label));
};
