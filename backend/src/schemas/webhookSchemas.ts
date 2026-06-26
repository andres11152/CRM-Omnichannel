import { z } from "zod";
import { WebhookEvents } from "@/types/types";

// Derive enum values at module level for runtime use in zod
const VALID_WEBHOOK_EVENTS = Object.values(WebhookEvents) as [string, ...string[]];

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
  description: z.string().max(200).optional(),
  events: z
    .array(z.enum(VALID_WEBHOOK_EVENTS))
    .min(1, "At least one event is required"),
  secretKey: z.string().optional(),
});

export type CreateWebhookDto = z.infer<typeof createWebhookSchema>;

export const metaIncomingWebhookSchema = z
  .object({
    object: z.string().optional(),
    entry: z
      .array(
        z
          .object({
            id: z.string().optional(),
            time: z.number().optional(),
            changes: z
              .array(
                z
                  .object({
                    value: z
                      .object({
                        messaging_product: z.string().optional(),
                        metadata: z
                          .object({
                            display_phone_number: z.string().optional(),
                            phone_number_id: z.string().optional(),
                          })
                          .optional(),
                        contacts: z
                          .array(
                            z.object({
                              profile: z
                                .object({ name: z.string().optional() })
                                .optional(),
                              wa_id: z.string().optional(),
                            }),
                          )
                          .optional(),
                        messages: z
                          .array(
                            z
                              .object({
                                from: z.string(),
                                id: z.string(),
                                timestamp: z.string(),
                                type: z.string(),
                                text: z
                                  .object({ body: z.string() })
                                  .optional(),
                                image: z
                                  .object({
                                    id: z.string(),
                                    caption: z.string().optional(),
                                    mime_type: z.string().optional(),
                                  })
                                  .optional(),
                                video: z
                                  .object({
                                    id: z.string(),
                                    caption: z.string().optional(),
                                    mime_type: z.string().optional(),
                                  })
                                  .optional(),
                                audio: z
                                  .object({
                                    id: z.string(),
                                    mime_type: z.string().optional(),
                                  })
                                  .optional(),
                                document: z
                                  .object({
                                    id: z.string(),
                                    filename: z.string().optional(),
                                    caption: z.string().optional(),
                                    mime_type: z.string().optional(),
                                  })
                                  .optional(),
                              })
                              .passthrough(),
                          )
                          .optional(),
                      })
                      .passthrough(),
                    field: z.string().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
