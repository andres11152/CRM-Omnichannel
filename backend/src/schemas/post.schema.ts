import { z } from "zod";

/**
 * 📝 POST VALIDATION SCHEMAS
 *
 * Validation for forum/blog posts
 */

export const CreatePostSchema = z.object({
  body: z.object({
    content: z.string().min(1, "El contenido no puede estar vacío."),
  }),
});

export const UpdatePostSchema = z.object({
  body: z.object({
    content: z.string().min(1, "El contenido no puede estar vacío.").optional(),
  }),
  params: z.object({
    id: z.string().cuid("ID no válido."),
  }),
});
