import { z } from "zod";

/**
 * 🛡️ COMMON VALIDATION SCHEMAS
 *
 * Reusable schemas for common patterns across routes:
 * - CUID ID params
 * - Pagination query
 * - Simple string query
 *
 * Use these for routes that only need simple param/query validation
 * without domain-specific body schemas.
 */

// ────────────────────────────────────────────────
// GENERIC ID PARAMS
// ────────────────────────────────────────────────

/** Generic :id param validation (CUID) */
export const IdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid ID format"),
  }),
});

/** Generic :id param + optional pagination */
export const IdParamWithPaginationSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid ID format"),
  }),
  query: z.object({
    limit: z
      .string()
      .transform((v) => parseInt(v, 10))
      .pipe(z.number().min(1).max(100))
      .optional()
      .default("20"),
    offset: z
      .string()
      .transform((v) => parseInt(v, 10))
      .pipe(z.number().min(0))
      .optional()
      .default("0"),
  }),
});

// ────────────────────────────────────────────────
// NOTIFICATIONS
// ────────────────────────────────────────────────

export const GetNotificationsSchema = z.object({
  query: z.object({
    limit: z
      .string()
      .transform((v) => parseInt(v, 10))
      .pipe(z.number().min(1).max(100))
      .optional()
      .default("20"),
    unreadOnly: z.enum(["true", "false"]).optional().default("false"),
  }),
});

export const NotificationIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid notification ID"),
  }),
});

// ────────────────────────────────────────────────
// AI / ASSISTANTS
// ────────────────────────────────────────────────

export const UpdateAIConfigSchema = z.object({
  body: z.object({
    openaiApiKey: z.string().max(500).optional(),
    defaultModel: z.string().max(100).optional(),
    enabled: z.boolean().optional(),
  }),
});

export const CreateAssistantSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required").max(100).trim(),
    instructions: z.string().max(5000, "Instructions too long").optional(),
    model: z.string().max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
    isDefault: z.boolean().optional(),
  }),
});

export const UpdateAssistantSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid assistant ID"),
  }),
  body: z.object({
    name: z.string().min(1).max(100).trim().optional(),
    instructions: z.string().max(5000).optional(),
    model: z.string().max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
    isDefault: z.boolean().optional(),
  }),
});

export const TestAISchema = z.object({
  body: z.object({
    message: z.string().min(1, "Message is required").max(2000),
    assistantId: z.string().cuid("Invalid assistant ID").optional(),
  }),
});

export const CopilotActionSchema = z.object({
  body: z.object({
    action: z.enum(["suggest_reply", "summarize", "translate", "sentiment"]),
    context: z.string().max(5000).optional(),
    conversationId: z.string().cuid().optional(),
    targetLanguage: z.string().max(10).optional(),
  }),
});

// ────────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ────────────────────────────────────────────────

export const PushSubscribeSchema = z.object({
  body: z.object({
    subscription: z.object({
      endpoint: z.string().url("Invalid endpoint URL"),
      keys: z.object({
        p256dh: z.string().min(1, "p256dh key required"),
        auth: z.string().min(1, "auth key required"),
      }),
    }),
  }),
});

export const PushUnsubscribeSchema = z.object({
  body: z.object({
    endpoint: z.string().url("Invalid endpoint URL"),
  }),
});

// ────────────────────────────────────────────────
// API KEYS
// ────────────────────────────────────────────────

export const CreateApiKeySchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, "API key name is required")
      .max(100, "Name too long")
      .trim(),
    expiresInDays: z.number().int().min(1).max(365).optional(),
  }),
});

export const RevokeApiKeySchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid API key ID"),
  }),
});

// ────────────────────────────────────────────────
// ANALYTICS / DASHBOARD (query params)
// ────────────────────────────────────────────────

export const AnalyticsQuerySchema = z.object({
  query: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    period: z.enum(["today", "week", "month", "quarter", "year"]).optional(),
    groupBy: z.enum(["hour", "day", "week", "month"]).optional(),
  }),
});

// ────────────────────────────────────────────────
// TYPE EXPORTS
// ────────────────────────────────────────────────
export type CreateAssistantInput = z.infer<
  typeof CreateAssistantSchema
>["body"];
export type UpdateAssistantInput = z.infer<
  typeof UpdateAssistantSchema
>["body"];
export type TestAIInput = z.infer<typeof TestAISchema>["body"];
export type CopilotActionInput = z.infer<typeof CopilotActionSchema>["body"];
