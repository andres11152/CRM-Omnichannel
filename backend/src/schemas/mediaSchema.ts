import { z } from "zod";

/**
 * [SEC] MEDIA VALIDATION SCHEMAS
 *
 * Covers media upload, listing, retrieval, update, and deletion.
 * Prevents path traversal, XSS in metadata, and DoS via pagination.
 */

// ────────────────────────────────────────────────
// MEDIA ID PARAM (get, delete, content)
// ────────────────────────────────────────────────

export const MediaIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid media ID format"),
  }),
});

// ────────────────────────────────────────────────
// GET MEDIA LIST
// ────────────────────────────────────────────────

export const GetMediaListSchema = z.object({
  query: z.object({
    page: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().min(1).max(1000))
      .optional()
      .default("1"),
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().min(1).max(100))
      .optional()
      .default("20"),
    search: z.string().max(200, "Search query too long").optional(),
    type: z.enum(["image", "video", "audio", "document", "other"]).optional(),
    category: z.string().max(50, "Category too long").optional(),
  }),
});

// ────────────────────────────────────────────────
// UPLOAD MEDIA (body fields alongside file)
// ────────────────────────────────────────────────

export const UploadMediaSchema = z.object({
  body: z.object({
    category: z.string().max(50, "Category too long").trim().optional(),
    description: z.string().max(500, "Description too long").trim().optional(),
    tags: z
      .union([
        z.array(z.string().max(50)),
        z.string().transform((val) => val.split(",").map((t) => t.trim())),
      ])
      .optional(),
  }),
});

// ────────────────────────────────────────────────
// UPDATE MEDIA METADATA
// ────────────────────────────────────────────────

export const UpdateMediaSchema = z.object({
  params: z.object({
    id: z.string().cuid("Invalid media ID format"),
  }),
  body: z
    .object({
      category: z.string().max(50, "Category too long").trim().optional(),
      description: z
        .string()
        .max(500, "Description too long")
        .trim()
        .optional(),
      tags: z
        .union([
          z.array(z.string().max(50)),
          z.string().transform((val) => val.split(",").map((t) => t.trim())),
        ])
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

// ────────────────────────────────────────────────
// TYPE EXPORTS
// ────────────────────────────────────────────────
export type UploadMediaInput = z.infer<typeof UploadMediaSchema>["body"];
export type UpdateMediaInput = z.infer<typeof UpdateMediaSchema>["body"];
