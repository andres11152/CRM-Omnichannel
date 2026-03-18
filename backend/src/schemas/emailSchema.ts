import { z } from "zod";

/**
 * 🛡️ EMAIL VALIDATION SCHEMAS
 *
 * Comprehensive validation for email operations:
 * - Sending emails (body validation)
 * - SMTP connection testing
 * - Email queries by contact/ticket
 * - Timeline queries
 */

// ────────────────────────────────────────────────
// SEND EMAIL
// ────────────────────────────────────────────────

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).or(
    z
      .string()
      .email()
      .transform((email) => [email]),
  ),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(500, "Subject too long"),
  bodyHtml: z
    .string()
    .min(1, "Email body is required")
    .max(500_000, "Email body too large"),
  bodyText: z.string().max(500_000, "Body text too large").optional(),
  replyTo: z.string().email().optional(),
  contactId: z.string().cuid("Invalid contact ID").optional(),
  ticketId: z.string().cuid("Invalid ticket ID").optional(),
  enableTracking: z.boolean().optional(),
});

/** Middleware-compatible wrapper */
export const SendEmailSchema = z.object({
  body: sendEmailSchema,
});

// ────────────────────────────────────────────────
// SMTP CONNECTION TEST
// ────────────────────────────────────────────────

export const testEmailConnectionSchema = z.object({
  host: z.string().min(1, "SMTP Host is required").max(255),
  port: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  user: z.string().min(1, "SMTP User is required").max(255),
  password: z.string().min(1, "SMTP Password is required").max(500),
  secure: z.boolean(),
  toEmail: z.string().email("Invalid recipient email"),
  senderEmail: z.string().email("Invalid sender email").optional(),
});

/** Middleware-compatible wrapper */
export const TestEmailConnectionSchema = z.object({
  body: testEmailConnectionSchema,
});

// ────────────────────────────────────────────────
// EMAIL QUERIES (by contact/ticket)
// ────────────────────────────────────────────────

/** GET /emails/contact/:contactId */
export const GetEmailsByContactSchema = z.object({
  params: z.object({
    contactId: z.string().cuid("Invalid contact ID format"),
  }),
});

/** GET /emails/ticket/:ticketId */
export const GetEmailsByTicketSchema = z.object({
  params: z.object({
    ticketId: z.string().cuid("Invalid ticket ID format"),
  }),
});

// ────────────────────────────────────────────────
// TIMELINE
// ────────────────────────────────────────────────

/** GET /emails/timeline?contactId=xxx&ticketId=yyy&limit=100&offset=0 */
export const GetTimelineSchema = z.object({
  query: z.object({
    contactId: z.string().cuid("Invalid contact ID").optional(),
    ticketId: z.string().cuid("Invalid ticket ID").optional(),
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().min(1).max(500))
      .optional()
      .default("100"),
    offset: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().min(0))
      .optional()
      .default("0"),
  }),
});

/** GET /emails/timeline/:contactId/stats */
export const GetTimelineStatsSchema = z.object({
  params: z.object({
    contactId: z.string().cuid("Invalid contact ID format"),
  }),
});

// ────────────────────────────────────────────────
// TYPE EXPORTS
// ────────────────────────────────────────────────
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type TestEmailConnectionInput = z.infer<
  typeof testEmailConnectionSchema
>;
