import { z } from "zod";

/**
 * 🏷️ TAG VALIDATION SCHEMAS
 *
 * Validation for system-wide tags
 */

export const CreateTagSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre de la etiqueta no puede estar vacío."),
    color: z.string().optional().default("bg-gray-100 text-gray-800"),
  }),
});

export const DeleteTagSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de etiqueta no válido"),
  }),
});
