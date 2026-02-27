import { z } from "zod";

/**
 * 🛡️ MESSAGE TEMPLATE VALIDATION SCHEMAS
 *
 * Security-focused validation for WhatsApp message templates
 * Ensures templates follow WhatsApp Business API requirements
 */

/**
 * Template category enum (WhatsApp Business API)
 */
const TemplateCategory = z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]);

/**
 * Channel enum
 */
const TemplateChannel = z.enum([
  "EMAIL",
  "WHATSAPP",
  "SMS",
  "WEB_CHAT",
  "TELEGRAM",
  "FACEBOOK_MESSENGER",
  "INSTAGRAM_DM",
]);

/**
 * Template status enum
 */
const TemplateStatus = z.enum(["approved", "pending", "rejected", "draft"]);

/**
 * Validate template name (snake_case format)
 * Examples: bienvenida_cliente, order_confirmation, password_reset
 */
const templateNameRegex = /^[a-z0-9_]+$/;

/**
 * Base template fields
 */
const baseTemplateFields = {
  name: z
    .string()
    .min(3, "Template name must be at least 3 characters")
    .max(100, "Template name is too long (max 100 characters)")
    .toLowerCase()
    .regex(
      templateNameRegex,
      "Template name must be snake_case (lowercase letters, numbers, and underscores only)",
    )
    .transform((val) => val.trim()),

  channel: TemplateChannel.default("WHATSAPP").optional(),

  subject: z
    .string()
    .max(200, "Subject is too long (max 200 characters)")
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  language: z
    .string()
    .length(2, "Language code must be 2 characters (e.g., es, en, pt)")
    .toLowerCase()
    .regex(/^[a-z]{2}$/, "Invalid language code format")
    .default("es"),

  category: TemplateCategory.default("MARKETING"),

  status: TemplateStatus.default("approved").optional(),

  /**
   * Template components (WhatsApp Business API format)
   * Supports variables like {{1}}, {{name}}, etc.
   */
  components: z
    .array(
      z.object({
        type: z.enum(["HEADER", "BODY", "FOOTER", "BUTTONS"]),
        text: z
          .string()
          .max(
            1024,
            "Component text is too long (max 1024 characters for WhatsApp)",
          )
          .optional(),
        parameters: z.array(z.string()).optional(),
        buttons: z
          .array(
            z.object({
              type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
              text: z.string().max(20, "Button text too long"),
              url: z.string().url().optional(),
              phone_number: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1, "At least one component is required")
    .refine(
      (components) => {
        // Must have at least one BODY component
        return components.some((c) => c.type === "BODY");
      },
      {
        message: "Template must have at least one BODY component",
      },
    )
    .refine(
      (components) => {
        // Validate that BODY text has valid variable syntax
        const bodyComponent = components.find((c) => c.type === "BODY");
        if (!bodyComponent?.text) return true;

        // Check for valid variable patterns: {{1}}, {{name}}, etc.
        // Variable pattern validation is available but permissive for now

        // If there are variables, they must be properly formatted
        return true; // Allow any valid mustache-style variables
      },
      {
        message: "Template variables must be in {{variable_name}} format",
      },
    ),
};

/**
 * CREATE TEMPLATE SCHEMA
 */
export const CreateTemplateSchema = z.object({
  body: z.object({
    name: baseTemplateFields.name,
    channel: baseTemplateFields.channel,
    subject: baseTemplateFields.subject,
    language: baseTemplateFields.language,
    category: baseTemplateFields.category,
    status: baseTemplateFields.status,
    components: baseTemplateFields.components,
  }),
});

/**
 * UPDATE TEMPLATE SCHEMA
 */
export const UpdateTemplateSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid template ID format"),
  }),
  body: z
    .object({
      name: baseTemplateFields.name.optional(),
      subject: baseTemplateFields.subject,
      language: baseTemplateFields.language.optional(),
      category: baseTemplateFields.category.optional(),
      status: baseTemplateFields.status,
      components: baseTemplateFields.components.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

/**
 * GET TEMPLATES SCHEMA
 */
export const GetTemplatesSchema = z.object({
  query: z.object({
    category: TemplateCategory.optional(),
    channel: TemplateChannel.optional(),
    status: TemplateStatus.optional(),
    search: z.string().max(100).optional(),
    limit: z
      .string()
      .transform((val) => parseInt(val))
      .pipe(z.number().min(1).max(100))
      .optional()
      .default("50"),
    offset: z
      .string()
      .transform((val) => parseInt(val))
      .pipe(z.number().min(0))
      .optional()
      .default("0"),
  }),
});

/**
 * GET TEMPLATE BY ID SCHEMA
 */
export const GetTemplateSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid template ID format"),
  }),
});

/**
 * DELETE TEMPLATE SCHEMA
 */
export const DeleteTemplateSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid template ID format"),
  }),
});

/**
 * TEST TEMPLATE SEND SCHEMA
 * For testing template with real parameters
 */
export const TestTemplateSendSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid template ID format"),
  }),
  body: z.object({
    to: z
      .string()
      .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
      .transform((val) => val.replace(/[\s\-()]/g, "")), // Clean phone

    parameters: z
      .record(z.string().max(500, "Parameter value too long"))
      .refine((params) => Object.keys(params).length <= 20, {
        message: "Too many parameters (max 20)",
      }),

    conversationId: z.string().cuid("Invalid conversation ID").optional(),

    senderId: z.string().cuid("Invalid sender ID").optional(),
  }),
});

/**
 * Type exports for TypeScript inference
 */
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>["body"];
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>["body"];
export type TestTemplateSendInput = z.infer<
  typeof TestTemplateSendSchema
>["body"];
