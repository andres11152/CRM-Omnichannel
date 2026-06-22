import { z } from "zod";

/**
 * [SEC] ROUTING CONFIGURATION VALIDATION SCHEMAS
 *
 * Ensures all chat-routing and auto-assignment rules are validated
 * before saving to Company.settings JSON field.
 */

export const RoutingRuleSchema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL", "SMS", "ALL"]),
  queueId: z.string().cuid("ID de cola no válido"),
  priority: z.number().int().min(0),
});

export const UpdateRoutingConfigSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
    defaultQueueId: z.string().cuid("ID de cola por defecto no válido").nullable().optional(),
    aiAutoResponse: z.boolean(),
    rules: z.array(RoutingRuleSchema).default([]),
  }),
});

export type UpdateRoutingConfigInput = z.infer<typeof UpdateRoutingConfigSchema>["body"];
