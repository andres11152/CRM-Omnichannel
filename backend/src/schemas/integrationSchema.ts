import { z } from "zod";

/**
 * [SEC] INTEGRATION VALIDATION SCHEMAS
 *
 * Covers WhatsApp session lifecycle via integration layer:
 * - Session status checks
 * - Sync operations with date validation
 */

/**
 * POST /integrations/whatsapp/sync
 * Validates sync parameters
 */
export const IntegrationSyncSchema = z.object({
  body: z.object({
    fromDate: z
      .string()
      .datetime({ message: "fromDate must be a valid ISO 8601 date" })
      .optional(),
    limit: z
      .number()
      .int()
      .min(1, "Minimum 1 message")
      .max(5000, "Maximum 5000 messages per sync")
      .optional()
      .default(500),
  }),
});

export type IntegrationSyncInput = z.infer<
  typeof IntegrationSyncSchema
>["body"];
