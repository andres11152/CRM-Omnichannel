import { z } from "zod";

/**
 *  COMPANY VALIDATION SCHEMAS
 *
 * Validation for company (tenant) and settings operations
 */

export const UpdateCompanySettingsSchema = z.object({
  body: z.object({
    general: z
      .object({
        name: z.string().optional(),
        logo: z.string().optional(),
        slug: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        timezone: z.string().optional(),
      })
      .optional(),
    smtp: z
      .object({
        host: z.string().optional(),
        port: z.union([z.string(), z.number()]).optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        secure: z.boolean().optional(),
        senderEmail: z.string().email().optional().or(z.literal("")),
        senderName: z.string().optional(),
        provider: z.string().optional(),
      })
      .optional(),
    businessHours: z
      .object({
        enabled: z.boolean().optional(),
        schedule: z
          .record(
            z.object({
              open: z.string(),
              close: z.string(),
              active: z.boolean(),
            }),
          )
          .optional(),
      })
      .optional(),
    automation: z
      .object({
        welcomeMessage: z.string().optional(),
        welcomeEnabled: z.boolean().optional(),
        oooMessage: z.string().optional(),
        oooEnabled: z.boolean().optional(),
      })
      .optional(),
    dataRequest: z
      .object({
        suggestedFields: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              iconName: z.string().optional(),
              color: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
});
