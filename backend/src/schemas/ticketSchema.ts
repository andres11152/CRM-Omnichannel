import { z } from "zod";

/**
 * [SEC] TICKET VALIDATION SCHEMAS
 *
 * Comprehensive validation for support ticket operations
 * Prevents data corruption and ensures proper ticket workflow
 */

/**
 * Ticket status enum (from Prisma schema)
 */
const TicketStatus = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

/**
 * Ticket priority enum
 */
const TicketPriority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

/**
 * Ticket resolution type enum
 */
const TicketResolutionType = z.enum([
  "SALE",
  "SUPPORT",
  "ADMIN",
  "OTHER",
  "SPAM",
]);

/**
 * Base ticket fields
 */
const baseTicketFields = {
  subject: z
    .string()
    .min(2, "Subject must be at least 2 characters")
    .max(200, "Subject is too long (max 200 characters)")
    .trim()
    .transform((val) => val.replace(/\s+/g, " ")),

  description: z
    .string()
    .min(1, "Description is required")
    .max(5000, "Description is too long (max 5000 characters for security)")
    .trim(),

  status: TicketStatus.default("OPEN").optional(),

  priority: TicketPriority.default("MEDIUM").optional(),

  assignedToId: z
    .string()
    .cuid("Invalid user ID format")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? null : val))
    .nullable(),

  queueId: z
    .string()
    .cuid("Invalid queue ID format")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? null : val))
    .nullable(),

  conversationId: z
    .string()
    .cuid("Invalid conversation ID format")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  resolutionType: TicketResolutionType.optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  resolutionNotes: z
    .string()
    .max(2000, "Resolution notes are too long (max 2000 characters)")
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),
};

/**
 * CREATE TICKET SCHEMA
 */
export const CreateTicketSchema = z.object({
  body: z.object({
    subject: baseTicketFields.subject,
    description: baseTicketFields.description,
    status: baseTicketFields.status,
    priority: baseTicketFields.priority,
    assignedToId: baseTicketFields.assignedToId,
    queueId: baseTicketFields.queueId,
    conversationId: baseTicketFields.conversationId,
  }),
});

/**
 * UPDATE TICKET SCHEMA
 * All fields optional (partial update)
 */
export const UpdateTicketSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid ticket ID format"),
  }),
  body: z
    .object({
      subject: baseTicketFields.subject.optional(),
      description: baseTicketFields.description.optional(),
      status: baseTicketFields.status,
      priority: baseTicketFields.priority,
      assignedToId: baseTicketFields.assignedToId,
      queueId: baseTicketFields.queueId,
      resolutionType: baseTicketFields.resolutionType,
      resolutionNotes: baseTicketFields.resolutionNotes,
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    })
    .refine(
      (data) => {
        // If status is RESOLVED or CLOSED, resolutionType is required
        if (
          (data.status === "RESOLVED" || data.status === "CLOSED") &&
          !data.resolutionType
        ) {
          return false;
        }
        return true;
      },
      {
        message:
          "Resolution type is required when closing or resolving a ticket",
        path: ["resolutionType"],
      },
    ),
});

/**
 * RESOLVE TICKET SCHEMA
 * Specific schema for ticket resolution
 */
export const ResolveTicketSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid ticket ID format"),
  }),
  body: z.object({
    resolutionType: TicketResolutionType,
    resolutionNotes: baseTicketFields.resolutionNotes.optional(),
    status: z.literal("RESOLVED").or(z.literal("CLOSED")).default("RESOLVED"),
  }),
});

/**
 * GET TICKETS SCHEMA
 * Validates query parameters
 */
export const GetTicketsSchema = z.object({
  query: z.object({
    status: TicketStatus.optional(),
    priority: TicketPriority.optional(),
    assignedToId: z.string().cuid().optional(),
    queueId: z.string().cuid().optional(),
    search: z.string().max(100, "Search query too long").optional(),
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
 * GET TICKET BY ID SCHEMA
 */
export const GetTicketSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid ticket ID format"),
  }),
});

/**
 * DELETE TICKET SCHEMA
 */
export const DeleteTicketSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid ticket ID format"),
  }),
});

/**
 * ASSIGN TICKET SCHEMA
 * For assigning tickets to agents
 */
export const AssignTicketSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid ticket ID format"),
  }),
  body: z.object({
    assignedToId: z.string().cuid("Invalid user ID format"),
    queueId: z.string().cuid("Invalid queue ID format").optional(),
  }),
});

/**
 * Type exports for TypeScript inference
 */
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>["body"];
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>["body"];
export type ResolveTicketInput = z.infer<typeof ResolveTicketSchema>["body"];
