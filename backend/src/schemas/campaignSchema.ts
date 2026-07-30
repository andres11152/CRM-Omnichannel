import { z } from "zod";

/**
 * [SEC] CAMPAIGN VALIDATION SCHEMAS
 *
 * Security-focused validation for marketing campaigns
 * Prevents message injection, DoS attacks, and scheduling errors
 */

/**
 * Valid campaign channels
 */
const CampaignChannel = z.enum([
  "EMAIL",
  "WHATSAPP",
  "SMS",
  "WEB_CHAT",
  "TELEGRAM",
  "FACEBOOK_MESSENGER",
  "INSTAGRAM_DM",
]);

/**
 * Campaign status enum
 */
const CampaignStatus = z.enum([
  "draft",
  "scheduled",
  "sending",
  "sent",
  "paused",
  "cancelled",
  "failed",
]);

/**
 * Base campaign fields
 */
const baseCampaignFields = {
  name: z
    .string()
    .min(3, "Campaign name must be at least 3 characters")
    .max(100, "Campaign name is too long (max 100 characters)")
    .trim()
    .transform((val) => val.replace(/\s+/g, " ")),

  channel: CampaignChannel.default("WHATSAPP"),

  subject: z
    .string()
    .max(200, "Subject is too long (max 200 characters)")
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  messageContent: z
    .string()
    .min(1, "Message content is required")
    .max(5000, "Message is too long (max 5000 characters for security)")
    .trim(),

  templateId: z
    .string()
    .cuid("Invalid template ID format")
    .optional()
    .or(z.literal("")),

  targetTags: z
    .array(z.string().max(50, "Tag is too long"))
    .max(20, "Too many tags (max 20)")
    .default([])
    .optional(),

  status: CampaignStatus.default("draft").optional(),

  scheduledAt: z
    .string()
    .datetime("Invalid datetime format")
    .or(z.date())
    .optional()
    .or(z.literal(""))
    .transform((val) => {
      if (!val || val === "") return undefined;
      const date = typeof val === "string" ? new Date(val) : val;

      // Validate future date
      const now = new Date();
      if (date <= now) {
        throw new Error("Scheduled date must be in the future");
      }

      return date;
    })
    .refine(
      (date) => {
        if (!date) return true; // Optional field
        // Max 1 year in advance
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        return date <= oneYearFromNow;
      },
      {
        message: "Scheduled date cannot be more than 1 year in the future",
      }
    ),

  config: z
    .object({
      delayBetweenMessages: z.number().min(0).max(300).optional(), // Max 5 min delay
      maxRecipientsPerBatch: z.number().min(1).max(1000).optional(),
      retryOnFail: z.boolean().optional(),
      trackOpens: z.boolean().optional(),
      trackClicks: z.boolean().optional(),
    })
    .optional()
    .or(z.literal(""))
    .transform((val) => {
      if (val === "") return undefined;
      return val;
    }),

  stats: z
    .object({
      sent: z.number().min(0).optional(),
      delivered: z.number().min(0).optional(),
      failed: z.number().min(0).optional(),
      opened: z.number().min(0).optional(),
      clicked: z.number().min(0).optional(),
    })
    .optional(),
};

/**
 * CREATE CAMPAIGN SCHEMA
 */
export const CreateCampaignSchema = z.object({
  body: z.object({
    name: baseCampaignFields.name,
    channel: baseCampaignFields.channel,
    subject: baseCampaignFields.subject,
    messageContent: baseCampaignFields.messageContent,
    templateId: baseCampaignFields.templateId,
    targetTags: baseCampaignFields.targetTags,
    status: baseCampaignFields.status,
    scheduledAt: baseCampaignFields.scheduledAt,
    config: baseCampaignFields.config,
  }),
});

/**
 * UPDATE CAMPAIGN SCHEMA
 * All fields optional (partial update)
 */
export const UpdateCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid campaign ID format"),
  }),
  body: z
    .object({
      name: baseCampaignFields.name.optional(),
      channel: baseCampaignFields.channel.optional(),
      subject: baseCampaignFields.subject,
      messageContent: baseCampaignFields.messageContent.optional(),
      templateId: baseCampaignFields.templateId,
      targetTags: baseCampaignFields.targetTags,
      status: baseCampaignFields.status,
      scheduledAt: baseCampaignFields.scheduledAt,
      config: baseCampaignFields.config,
      stats: baseCampaignFields.stats,
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

/**
 * GET CAMPAIGNS SCHEMA
 */
export const GetCampaignsSchema = z.object({
  query: z.object({
    status: CampaignStatus.optional(),
    channel: CampaignChannel.optional(),
    search: z.string().max(100).optional(),
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    offset: z.coerce.number().min(0).optional().default(0),
  }),
});

/**
 * GET CAMPAIGN BY ID SCHEMA
 */
export const GetCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid campaign ID format"),
  }),
});

/**
 * DELETE CAMPAIGN SCHEMA
 */
export const DeleteCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid campaign ID format"),
  }),
});

/**
 * SEND CAMPAIGN SCHEMA
 * For immediate campaign execution
 */
export const SendCampaignSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid campaign ID format"),
  }),
});

/**
 * Type exports for TypeScript inference
 */
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>["body"];
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>["body"];

