import { z } from "zod";

/**
 * [SEC] QUICK REPLY VALIDATION SCHEMAS
 *
 * Prevents empty or oversized quick replies from being saved.
 */

export const CreateQuickReplySchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(1, "El título es requerido.")
      .max(100, "El título no puede exceder 100 caracteres."),
    content: z
      .string()
      .min(1, "El contenido es requerido.")
      .max(5000, "El contenido no puede exceder 5000 caracteres."),
    category: z.string().max(50).optional(),
  }),
});

export const UpdateQuickReplySchema = z.object({
  params: z.object({
    id: z.string().min(1, "Quick Reply ID es requerido."),
  }),
  body: z.object({
    title: z.string().min(1).max(100).optional(),
    content: z.string().min(1).max(5000).optional(),
    category: z.string().max(50).optional(),
  }),
});

export const QuickReplyIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Quick Reply ID es requerido."),
  }),
});

// --- Inferred Types ---
export type CreateQuickReplyInput = z.infer<typeof CreateQuickReplySchema>["body"];
export type UpdateQuickReplyInput = z.infer<typeof UpdateQuickReplySchema>["body"];
