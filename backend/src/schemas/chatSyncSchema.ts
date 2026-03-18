import { z } from "zod";

/**
 * 🔄 CHAT SYNC SCHEMAS
 *
 * Validation for historical message synchronization requests.
 */

export const TriggerSyncSchema = z.object({
  body: z.object({
    sessionId: z.string().optional(),
    sinceDate: z.coerce
      .date()
      .transform((d) => d.toISOString())
      .optional(),
    limit: z.number().int().positive().max(1000).default(500),
    dryRun: z.boolean().default(false),
  }),
});

export const SyncConversationSchema = z.object({
  params: z.object({
    phone: z.string().min(5, "Invalid phone number format"),
  }),
  body: z
    .object({
      limit: z.number().int().positive().max(1000).default(500),
    })
    .optional()
    .default({}),
});
