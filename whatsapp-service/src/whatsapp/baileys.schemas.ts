import { z } from "zod";
import { Logger } from "../utils/logger";

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

export const MessageKeySchema = z
  .object({
    remoteJid: z.string().optional().nullable(),
    fromMe: z.boolean().optional().nullable(),
    id: z.string().min(1, "Message ID is required"),
    participant: z.string().optional().nullable(),
  })
  .passthrough();

export type ValidatedMessageKey = z.infer<typeof MessageKeySchema>;

export const WAMessageSchema = z
  .object({
    key: MessageKeySchema,
    message: z.unknown().optional().nullable(),
    messageTimestamp: z.unknown().optional().nullable(),
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

export const CallEventSchema = z
  .object({
    chatId: z.string().min(1, "Chat ID is required"),
    from: z.string().min(1, "From JID is required"),
    id: z.string().min(1, "Call ID is required"),
    status: z.enum([
      "offer",
      "ringing",
      "preaccept",
      "transport",
      "relaylatency",
      "timeout",
      "reject",
      "accept",
      "terminate",
    ]),
    isGroup: z.boolean().optional(),
    isVideo: z.boolean().optional(),
    offline: z.boolean().optional(),
  })
  .passthrough();

export const CallEventBatchSchema = z.array(CallEventSchema).min(1);

export type ValidatedCallEvent = z.infer<typeof CallEventSchema>;

export const HistorySyncSchema = z
  .object({
    messages: z.array(z.unknown()),
    chats: z.array(z.unknown()).optional(),
    contacts: z.array(z.unknown()).optional(),
    isLatest: z.boolean().optional(),
    syncType: z.number().optional(),
    progress: z.number().nullable().optional(),
    peerDataRequestSessionId: z.string().nullable().optional(),
  })
  .passthrough();

export type ValidatedHistorySync = z.infer<typeof HistorySyncSchema>;

export function validateBaileysEvent<T>(
  schema: z.ZodType<T>,
  data: unknown,
  eventName: string,
  context: { sessionId: string; companyId: string },
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    Logger.warn({
      sessionId: context.sessionId,
      companyId: context.companyId,
      errors: result.error.errors.map((e) => ({
        path: e.path.join("."),
        code: e.code,
        message: e.message,
      })),
    }, `[BaileysValidation] Invalid ${eventName} payload dropped`);
    return null;
  }
  return result.data;
}
