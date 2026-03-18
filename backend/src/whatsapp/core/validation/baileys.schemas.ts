import { z } from "zod";
import { Logger } from "@/utils/logger";

/**
 * 🛡️ BAILEYS EVENT VALIDATION SCHEMAS
 *
 * Zod schemas for validating raw payloads from @whiskeysockets/baileys.
 * These schemas act as the first line of defense against malformed,
 * incomplete, or tampered data entering the system.
 *
 * Strategy:
 *  - .passthrough() allows Baileys-specific fields to flow through
 *    without breaking when the library adds new properties
 *  - We only validate the fields WE actually use downstream
 *  - Failed validation = silent drop + structured log (never crash)
 */

// ────────────────────────────────────────────────
// CONNECTION UPDATE
// ────────────────────────────────────────────────

export const ConnectionUpdateSchema = z
  .object({
    connection: z.enum(["open", "close", "connecting"]).optional().nullable(),
    lastDisconnect: z
      .object({
        error: z.unknown().optional(),
        date: z.unknown().optional(),
      })
      .optional()
      .nullable(),
    qr: z.string().optional().nullable(),
    isNewLogin: z.boolean().optional(),
    receivedPendingNotifications: z.boolean().optional(),
  })
  .passthrough();

export type ValidatedConnectionUpdate = z.infer<typeof ConnectionUpdateSchema>;

// ────────────────────────────────────────────────
// MESSAGE KEY (shared by multiple schemas)
// ────────────────────────────────────────────────

export const MessageKeySchema = z
  .object({
    remoteJid: z.string().optional().nullable(),
    fromMe: z.boolean().optional().nullable(),
    id: z.string().min(1, "Message ID is required"),
    participant: z.string().optional().nullable(),
  })
  .passthrough();

export type ValidatedMessageKey = z.infer<typeof MessageKeySchema>;

// ────────────────────────────────────────────────
// INCOMING MESSAGE (messages.upsert)
// ────────────────────────────────────────────────

export const WAMessageSchema = z
  .object({
    key: MessageKeySchema,
    message: z.any().optional().nullable(),
    messageTimestamp: z.any().optional().nullable(),
    pushName: z.string().optional().nullable(),
    broadcast: z.boolean().optional().nullable(),
    status: z.number().optional().nullable(),
  })
  .passthrough();

export type ValidatedWAMessage = z.infer<typeof WAMessageSchema>;

export const MessagesUpsertSchema = z.object({
  messages: z.array(WAMessageSchema).min(1),
  type: z.enum(["append", "notify"]),
  requestId: z.string().optional(),
});

export type ValidatedMessagesUpsert = z.infer<typeof MessagesUpsertSchema>;

// ────────────────────────────────────────────────
// MESSAGE STATUS UPDATE (messages.update)
// ────────────────────────────────────────────────

export const MessageUpdateSchema = z
  .object({
    key: MessageKeySchema,
    update: z
      .object({
        status: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ValidatedMessageUpdate = z.infer<typeof MessageUpdateSchema>;

export const MessagesUpdateBatchSchema = z.array(MessageUpdateSchema).min(1);

// ────────────────────────────────────────────────
// PRESENCE UPDATE (presence.update)
// ────────────────────────────────────────────────

export const PresenceUpdateSchema = z
  .object({
    id: z.string().min(1, "Remote JID is required"),
    presences: z.record(
      z.string(),
      z
        .object({
          lastKnownPresence: z.string().min(1, "Presence status is required"),
          lastSeen: z.number().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type ValidatedPresenceUpdate = z.infer<typeof PresenceUpdateSchema>;

// ────────────────────────────────────────────────
// HISTORY SYNC (messaging-history.set)
// ────────────────────────────────────────────────

export const HistorySyncSchema = z
  .object({
    messages: z.array(z.unknown()),
    chats: z.array(z.unknown()).optional(),
    contacts: z.array(z.unknown()).optional(),
    isLatest: z.boolean().optional(),
  })
  .passthrough();

export type ValidatedHistorySync = z.infer<typeof HistorySyncSchema>;

// ────────────────────────────────────────────────
// VALIDATION HELPER
// ────────────────────────────────────────────────

/**
 * 🛡️ Safe-parse helper that returns null on validation failure.
 * Logs a structured warning with context for observability.
 *
 * @param schema - Zod schema to validate against
 * @param data - Raw data from Baileys
 * @param eventName - Name of the Baileys event for logging
 * @param context - Additional context (sessionId, companyId) for log tracing
 * @returns Validated data or null if validation failed
 */
export function validateBaileysEvent<T>(
  schema: z.ZodType<T>,
  data: unknown,
  eventName: string,
  context: { sessionId: string; companyId: string },
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    // Import-free structured log to avoid circular dependency with Logger
    // SessionManager will handle actual Logger calls
    Logger.warn(`[BaileysValidation] ⚠️ Invalid ${eventName} payload dropped`, {
      sessionId: context.sessionId,
      companyId: context.companyId,
      errors: result.error.errors.map((e) => ({
        path: e.path.join("."),
        code: e.code,
        message: e.message,
      })),
    });
    return null;
  }
  return result.data;
}
