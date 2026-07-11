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
 * POST /sessions/pairing-code
 */
export const RequestPairingCodeSchema = z.object({
  body: z.object({
    phone: z
      .string()
      .min(10, "El número de teléfono es muy corto")
      .max(20, "El número de teléfono es muy largo")
      .regex(/^\+?[1-9]\d{1,14}$/, "Formato de número inválido"),
  }),
});

/**
 * PATCH /sessions/:sessionId/profile-name
 */
export const UpdateProfileNameSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(25, "Máximo 25 caracteres"),
  }),
});

/**
 * PATCH /sessions/:sessionId/profile-picture
 */
export const UpdateProfilePictureSchema = z.object({
  body: z.object({
    imageUrl: z.string().url("URL de imagen inválida"),
  }),
});

// ────────────────────────────────────────────────
// GROUP MANAGEMENT (gated by WA_ENABLE_GROUP_MANAGEMENT server-side)
// ────────────────────────────────────────────────

export const UpdateGroupParticipantsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    phones: z.array(z.string().min(5)).min(1, "At least one phone is required").max(100, "Maximum 100 participants per request"),
    action: z.enum(["add", "remove", "promote", "demote"]),
  }),
});

export const UpdateGroupSubjectSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    subject: z.string().trim().min(1, "El nombre del grupo no puede estar vacío").max(100, "Máximo 100 caracteres"),
  }),
});

export const UpdateGroupDescriptionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    description: z.string().trim().max(2048, "Máximo 2048 caracteres"),
  }),
});

export const UpdateGroupSettingSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    setting: z.enum(["announcement", "not_announcement", "locked", "unlocked"]),
  }),
});

export const GroupIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
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
