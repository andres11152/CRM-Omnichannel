/**
 * ZOD VALIDATION SCHEMAS
 *
 * Runtime validation for API responses - prevents runtime explosions
 * Every API response MUST be validated before use
 */

import { z } from "zod";
import {
  Channel,
  MessageDirection,
  ConversationStatus,
  UserRole,
  MessageStatus,
  CompanyStatus,
} from "./domain";

// ============================================
// ENUM SCHEMAS
// ============================================

export const ChannelSchema = z.nativeEnum(Channel);
export const MessageDirectionSchema = z.nativeEnum(MessageDirection);
export const ConversationStatusSchema = z.nativeEnum(ConversationStatus);
export const UserRoleSchema = z.nativeEnum(UserRole);
export const MessageStatusSchema = z.nativeEnum(MessageStatus);
export const CompanyStatusSchema = z.nativeEnum(CompanyStatus);

// ============================================
// BASE SCHEMAS
// ============================================

export const BaseEntitySchema = z.object({
  id: z.string().cuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ============================================
// USER SCHEMAS
// ============================================

export const UserPreferencesSchema = z.object({
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    sms: z.boolean(),
  }),
  language: z.string(),
  timezone: z.string(),
  theme: z.enum(["light", "dark", "auto"]),
});

export const UserListItemSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  email: z.string().email(),
  role: UserRoleSchema,
  avatarUrl: z.string().url().nullable(),
});

export const UserSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRoleSchema,
  companyId: z.string().cuid(),
  phone: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  isActive: z.boolean(),
  preferences: UserPreferencesSchema.nullable(),
});

// ============================================
// COMPANY SCHEMAS
// ============================================

export const CompanySchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  status: CompanyStatusSchema,
  planId: z.string().cuid().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  website: z.string().url().nullable(),
  logoUrl: z.string().url().nullable(),
});

// ============================================
// CONTACT SCHEMAS
// ============================================

export const ContactSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  companyId: z.string().cuid(),
  avatarUrl: z.string().url().nullable(),
  tags: z.array(z.string()),
  customFields: z.record(z.string(), z.unknown()),
});

// ============================================
// MESSAGE SCHEMAS
// ============================================

export const MessageMediaSchema = z.object({
  type: z.enum(["image", "video", "audio", "document"]),
  url: z.string().url(),
  name: z.string().optional(),
  size: z.number().positive().optional(),
  mimetype: z.string().optional(),
});

export const MessageMetadataSchema = z
  .object({
    messageId: z.string().optional(),
    media: MessageMediaSchema.optional(),
    quotedMessage: z
      .object({
        id: z.string(),
        content: z.string(),
      })
      .optional(),
    location: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        address: z.string().optional(),
      })
      .optional(),
  })
  .passthrough(); // Allow additional fields

export const MessageSchema = BaseEntitySchema.extend({
  content: z.string(),
  channel: ChannelSchema,
  direction: MessageDirectionSchema,
  status: MessageStatusSchema,
  conversationId: z.string().cuid(),
  senderId: z.string().cuid(),
  sender: UserListItemSchema,
  metadata: MessageMetadataSchema.nullable(),
});

export const MessageCreateSchema = z.object({
  content: z.string().min(1).max(5000),
  conversationId: z.string().cuid(),
  media: MessageMediaSchema.optional(),
});

// ============================================
// CONVERSATION SCHEMAS
// ============================================

export const ConversationListItemSchema = z.object({
  id: z.string().cuid(),
  ticketId: z.string().optional(),
  subject: z.string().nullable(),
  status: ConversationStatusSchema,
  priority: z.string().optional(),
  channel: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  messageCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative().default(0),
  assignedTo: UserListItemSchema.nullable(),
  contact: ContactSchema.nullable().optional(),
  lastMessage: z
    .object({
      id: z.string().cuid(),
      content: z.string(),
      createdAt: z.string().datetime(),
      sender: UserListItemSchema,
    })
    .nullable()
    .optional(),
});

export const ConversationSchema = BaseEntitySchema.extend({
  subject: z.string().nullable(),
  status: ConversationStatusSchema,
  companyId: z.string().cuid(),
  channelId: z.string().nullable(),
  tags: z.array(z.string()),
  resolvedAt: z.string().datetime().nullable(),
  participants: z.array(UserListItemSchema),
  assignedTo: UserListItemSchema.nullable(),
  contact: ContactSchema.nullable(),
  messageCount: z.number().int().nonnegative(),
  lastMessage: MessageSchema.optional(),
});

export const ConversationDetailSchema = ConversationSchema.extend({
  messages: z.array(MessageSchema),
  messagePagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().cuid().nullable(),
    limit: z.number().int().positive(),
  }),
});

export const ConversationCreateSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  channelId: z.string(),
  contactId: z.string().cuid().optional(),
  tags: z.array(z.string()).optional(),
});

export const ConversationUpdateSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  status: ConversationStatusSchema.optional(),
  assignedToId: z.string().cuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// ============================================
// API RESPONSE SCHEMAS
// ============================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    status: z.enum(["success", "error"]),
    data: dataSchema.optional(),
    message: z.string().optional(),
    errors: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  });

export const PaginationSchema = z.object({
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  nextCursor: z.string().cuid().nullable(),
  limit: z.number().int().positive(),
});

export const ConversationListResponseSchema = z.object({
  status: z.literal("success"),
  results: z.number().int().nonnegative(),
  data: z.object({
    conversations: z.array(ConversationListItemSchema),
    pagination: PaginationSchema,
  }),
});

export const MessageListResponseSchema = z.object({
  status: z.literal("success"),
  results: z.number().int().nonnegative(),
  data: z.object({
    messages: z.array(MessageSchema),
    pagination: z.object({
      hasMore: z.boolean(),
      nextCursor: z.string().cuid().nullable(),
      limit: z.number().int().positive(),
    }),
  }),
});

// ============================================
// FORM SCHEMAS (with validation rules)
// ============================================

export const LoginFormSchema = z.object({
  email: z.string().email("Email invlido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const SignupFormSchema = z.object({
  email: z.string().email("Email invlido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  companyName: z.string().min(2).optional(),
});

export const MessageFormSchema = z.object({
  content: z.string().min(1, "El mensaje no puede estar vacío").max(5000),
  media: z.instanceof(File).optional(),
});

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Safely parse data with Zod schema
 * Throws detailed error if validation fails
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    console.error("[Validation Error]", result.error.format());
    throw new Error(
      `Validation failed: ${result.error.issues.map((e) => e.message).join(", ")}`,
    );
  }

  return result.data;
}

/**
 * Validate and transform API response
 */
export function validateApiResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return safeParse(schema, data);
  } catch (error) {
    console.error("[API Response Validation Error]", {
      receivedData: data,
      error,
    });
    throw new Error("Invalid API response format");
  }
}

/**
 * Type-safe form validation
 */
export function validateForm<T>(
  schema: z.ZodType<T>,
  data: unknown,
):
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  result.error.issues.forEach((err) => {
    const path = err.path.join(".");
    errors[path] = err.message;
  });

  return { success: false, errors };
}
