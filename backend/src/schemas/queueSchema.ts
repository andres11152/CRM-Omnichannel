import { z } from "zod";

/**
 *  QUEUE VALIDATION SCHEMAS
 *
 * Validation for Queue (department groups/routing) operations
 */

export const CreateQueueSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre de la cola es requerido."),
    description: z.string().optional(),
    type: z.enum(["MANUAL", "ROUND_ROBIN", "AI"]).optional().default("MANUAL"),
    isActive: z.boolean().optional().default(true),
    config: z.record(z.any()).optional().default({}),
    departmentId: z
      .string()
      .cuid("ID de departamento no válido.")
      .optional()
      .nullable(),
    aiAssistantId: z
      .string()
      .cuid("ID de asistente de IA no válido.")
      .optional()
      .nullable(),
  }),
});

export const UpdateQueueSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de cola no válido"),
  }),
  body: z
    .object({
      name: z.string().min(1, "El nombre no puede estar vacío.").optional(),
      description: z.string().optional(),
      type: z.enum(["MANUAL", "ROUND_ROBIN", "AI"]).optional(),
      isActive: z.boolean().optional(),
      config: z.record(z.any()).optional(),
      departmentId: z
        .string()
        .cuid("ID de departamento no válido.")
        .optional()
        .nullable(),
      aiAssistantId: z
        .string()
        .cuid("ID de asistente de IA no válido.")
        .optional()
        .nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Debe proporcionar al menos un campo para actualizar.",
    }),
});

export const QueueIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de cola no válido"),
  }),
});
