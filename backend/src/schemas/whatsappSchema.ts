import { z } from "zod";

/**
 * [SEC] WHATSAPP VALIDATION SCHEMAS
 *
 * Covers session management, reconnection, queue assignment,
 * and group participant operations.
 */

// ────────────────────────────────────────────────
// SESSION MANAGEMENT
// ────────────────────────────────────────────────

/**
 * DELETE / RECONNECT / GET a single session by :sessionId
 */
export const SessionIdParamSchema = z.object({
  params: z.object({
    sessionId: z
      .string()
      .min(1, "sessionId is required")
      .max(100, "sessionId too long"),
  }),
});

/**
 * PATCH /sessions/:sessionId — update defaultQueue
 */
export const UpdateSessionSchema = z.object({
  params: z.object({
    sessionId: z
      .string()
      .min(1, "sessionId is required")
      .max(100, "sessionId too long"),
  }),
  body: z.object({
    defaultQueueId: z
      .string()
      .cuid("Invalid queue ID format")
      .nullable()
      .optional(),
    proxyUrl: z
      .string()
      .nullable()
      .optional(),
  }),
});

// ────────────────────────────────────────────────
// GROUP PARTICIPANT OPERATIONS
// ────────────────────────────────────────────────

/**
 * GET /conversations/:id/participants
 */
export const GetGroupParticipantsSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid conversation ID format"),
  }),
});

/**
 * POST /conversations/:id/participants/add-to-crm
 */
export const AddParticipantToCRMSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid conversation ID format"),
  }),
  body: z.object({
    jid: z.string().min(1, "WhatsApp JID is required").max(100, "JID too long"),
    customName: z.string().max(200, "Name too long").optional(),
    tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
  }),
});

/**
 * POST /conversations/:id/participants/add-bulk
 */
export const AddBulkParticipantsSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid conversation ID format"),
  }),
  body: z.object({
    participants: z
      .array(
        z.object({
          jid: z
            .string()
            .min(1, "WhatsApp JID is required")
            .max(100, "JID too long"),
          customName: z.string().max(200, "Name too long").optional(),
          tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
        }),
      )
      .min(1, "At least one participant is required")
      .max(500, "Cannot add more than 500 participants at once"),
  }),
});

// ────────────────────────────────────────────────
// CONVERSATION PARAMS (for routes missing validation)
// ────────────────────────────────────────────────

/**
 * GET /conversations/:id
 * PATCH /conversations/:id/toggle-sync
 */
export const ConversationIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid conversation ID format"),
  }),
});

// ────────────────────────────────────────────────
// TYPE EXPORTS
// ────────────────────────────────────────────────
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>["body"];
export type AddParticipantInput = z.infer<
  typeof AddParticipantToCRMSchema
>["body"];
export type AddBulkParticipantsInput = z.infer<
  typeof AddBulkParticipantsSchema
>["body"];
