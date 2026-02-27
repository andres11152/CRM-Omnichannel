import { z } from "zod";

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).or(
    z
      .string()
      .email()
      .transform((email) => [email]),
  ),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1, "Subject is required"),
  bodyHtml: z.string().min(1, "Email body is required"),
  bodyText: z.string().optional(),
  replyTo: z.string().email().optional(),
  contactId: z.string().optional(),
  ticketId: z.string().optional(),
  enableTracking: z.boolean().optional(),
});

export const testEmailConnectionSchema = z.object({
  host: z.string().min(1, "SMTP Host is required"),
  port: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  user: z.string().min(1, "SMTP User is required"),
  password: z.string().min(1, "SMTP Password is required"),
  secure: z.boolean(),
  toEmail: z.string().email("Invalid recipient email"),
  senderEmail: z.string().email("Invalid sender email").optional(),
});
