import { z } from "zod";

export const whatsappWebhookSchema = z.object({
  from: z.string().min(1, "Sender (from) is required"),
  text: z.string().min(1, "Message text is required"),
  sessionId: z.string().optional(),
  contactName: z.string().optional(),
  senderName: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  messageId: z.string().optional(),
});

export type WhatsappWebhookDto = z.infer<typeof whatsappWebhookSchema>;

export const metaWebhookQuerySchema = z
  .object({
    "hub.mode": z.string().optional(),
    "hub.verify_token": z.string().optional(),
    "hub.challenge": z.string().optional(),
  })
  .passthrough();

export type MetaWebhookQueryDto = z.infer<typeof metaWebhookQuerySchema>;

export const createWebhookSchema = z.object({
  url: z.string().url("Invalid URL format"),
  events: z.array(z.string()).min(1, "At least one event is required"),
  secretKey: z.string().optional(),
});

export type CreateWebhookDto = z.infer<typeof createWebhookSchema>;
