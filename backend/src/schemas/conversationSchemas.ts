import { z } from "zod";
import { Channel } from "@prisma/client";

// Regex for international phone numbers: +[country code][number]
const phoneRegex = /^\+[1-9]\d{1,14}$/;

export const CreateConversationSchema = z.object({
  body: z.object({
    phone: z
      .string()
      .regex(
        phoneRegex,
        "Phone number must be in E.164 format (e.g., +1234567890)",
      ),
    name: z.string().optional(),
    message: z.string().optional(),
    addToContacts: z.boolean().optional(),
  }),
});

export const ReplyToConversationSchema = z.object({
  body: z
    .object({
      content: z.string().optional().default(""),
      channel: z.nativeEnum(Channel).optional(),
      attachment: z.any().optional(),
      metadata: z.record(z.any()).optional(),
      scheduledAt: z.string().datetime().optional(),
      quotedMessageId: z.string().optional(),
      quotedContent: z.string().optional(),
    })
    .refine(
      (data) => (data.content && data.content.length > 0) || data.attachment,
      {
        message: "Either message content or attachment is required",
        path: ["content"],
      },
    ),
});

export const UpdateTagsSchema = z.object({
  body: z.object({
    tags: z.array(z.string()).min(0),
  }),
});

export const ReactToMessageSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Conversation ID is required."),
    messageId: z.string().min(1, "Message ID is required."),
  }),
  body: z.object({
    reaction: z.string().max(10, "Reaction must be a single emoji."),
  }),
});
