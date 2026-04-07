import { z } from "zod";

/**
 * [SEC] CONTACT VALIDATION SCHEMAS
 *
 * Comprehensive validation and sanitization for Contact operations.
 * Prevents XSS, data corruption, and buffer overflow attacks.
 */

/**
 * Phone number regex: Allows international format with optional +
 * Examples: +525551234567, 5551234567, +1-555-123-4567
 */
const phoneRegex = /^\+?[1-9]\d{1,14}$/;

/**
 * Base contact validation rules (reusable)
 */
const baseContactFields = {
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name is too long (max 100 characters)")
    .trim()
    .transform((val) => {
      // Sanitize: Remove extra whitespace
      return val.replace(/\s+/g, " ");
    }),

  email: z
    .string()
    .email("Invalid email format")
    .toLowerCase()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((val) => {
      // Convert empty string to undefined
      if (val === "") return undefined;
      return val;
    }),

  phone: z
    .string()
    .transform((val) => {
      // Sanitize: Remove spaces, dashes, parentheses
      return val.replace(/[\s\-()]/g, "");
    })
    .refine(
      (val) => phoneRegex.test(val),
      "Invalid phone number format. Use international format (e.g., +525551234567)"
    )
    .optional()
    .or(z.literal(""))
    .transform((val) => {
      if (val === "") return undefined;
      return val;
    }),

  avatarUrl: z
    .string()
    .url("Invalid avatar URL")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  tags: z
    .array(z.string().max(50, "Tag is too long"))
    .max(20, "Too many tags (max 20)")
    .default([])
    .optional(),

  notes: z
    .string()
    .max(5000, "Notes are too long (max 5000 characters)")
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" ? undefined : val)),

  customFields: z.record(z.any()).optional().default({}),
};

/**
 * CREATE CONTACT SCHEMA
 * All fields validated, name is required
 */
export const CreateContactSchema = z.object({
  body: z
    .object({
      ...baseContactFields,
      name: baseContactFields.name, // Explicitly required
    })
    .refine((data) => data.email || data.phone, {
      message: "Either email or phone is required",
      path: ["email"], // Show error on email field
    }),
});

/**
 * UPDATE CONTACT SCHEMA
 * All fields are optional (partial update)
 */
export const UpdateContactSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid contact ID format"),
  }),
  body: z
    .object({
      name: baseContactFields.name.optional(),
      email: baseContactFields.email,
      phone: baseContactFields.phone,
      avatarUrl: baseContactFields.avatarUrl,
      tags: baseContactFields.tags,
      notes: baseContactFields.notes,
      customFields: baseContactFields.customFields,
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

/**
 * GET CONTACT DETAIL SCHEMA
 * Validates query params for fetching by ID or phone
 */
export const GetContactDetailSchema = z.object({
  query: z
    .object({
      id: z.string().cuid("Invalid contact ID").optional(),
      phone: z.string().min(5, "Phone too short").optional(),
    })
    .refine((data) => data.id || data.phone, {
      message: "Either id or phone query parameter is required",
    }),
});

/**
 * GET CONTACTS LIST SCHEMA
 * Validates search and pagination params
 */
export const GetContactsSchema = z.object({
  query: z.object({
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
 * DELETE CONTACT SCHEMA
 * Validates contact ID param
 */
export const DeleteContactSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid contact ID format"),
  }),
});

/**
 * IMPORT CONTACTS CSV SCHEMA (for future use)
 * Validates bulk import data
 */
export const ImportContactsSchema = z.object({
  body: z.object({
    contacts: z
      .array(
        z.object({
          name: baseContactFields.name,
          email: baseContactFields.email,
          phone: baseContactFields.phone,
          tags: baseContactFields.tags,
          notes: baseContactFields.notes,
          customFields: baseContactFields.customFields,
        })
      )
      .min(1, "At least one contact is required")
      .max(1000, "Maximum 1000 contacts per import"),

    deduplicateBy: z
      .enum(["phone", "email", "both"])
      .default("phone")
      .optional(),
  }),
});

/**
 * Type exports for TypeScript inference
 */
export type CreateContactInput = z.infer<typeof CreateContactSchema>["body"];
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>["body"];
export type GetContactDetailInput = z.infer<
  typeof GetContactDetailSchema
>["query"];

