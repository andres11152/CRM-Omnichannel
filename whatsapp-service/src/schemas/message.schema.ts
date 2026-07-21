import { z } from "zod";

const MediaPayloadSchema = z.object({
  url: z.string().url().optional(),
  type: z.enum(["image", "video", "audio", "document", "sticker", "location", "contact"]),
  mimetype: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
  contact: z.object({
    name: z.string(),
    phone: z.string(),
  }).optional(),
}).optional();

export const SendMessageSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }),
  to: z.string({ required_error: "to is required" }),
  type: z.enum(["text", "media"], { required_error: "type is required" }),
  content: z.string().optional(),
  media: MediaPayloadSchema,
  options: z.object({
    dbId: z.string().optional(),
    quoted: z.unknown().optional(),
    generatedMessageId: z.string().optional(),
  }).optional(),
});

export const PresenceSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }),
  to: z.string({ required_error: "to is required" }),
  type: z.enum(["composing", "recording", "paused"]),
});

export const ReactionSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }),
  to: z.string({ required_error: "to is required" }),
  messageId: z.string({ required_error: "messageId is required" }),
  reaction: z.string({ required_error: "reaction is required" }),
  fromMe: z.boolean().optional(),
});

export const EditMessageSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }),
  to: z.string({ required_error: "to is required" }),
  messageId: z.string({ required_error: "messageId is required" }),
  content: z.string({ required_error: "content is required" }),
});

export const RevokeMessageSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }),
  to: z.string({ required_error: "to is required" }),
  messageId: z.string({ required_error: "messageId is required" }),
});

export type SendMessageDto = z.infer<typeof SendMessageSchema>;
export type PresenceDto = z.infer<typeof PresenceSchema>;
export type ReactionDto = z.infer<typeof ReactionSchema>;
export type EditMessageDto = z.infer<typeof EditMessageSchema>;
export type RevokeMessageDto = z.infer<typeof RevokeMessageSchema>;
