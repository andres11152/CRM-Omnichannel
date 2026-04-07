import { z } from "zod";
import { ActivityType } from "@prisma/client";

/**
 *  ACTIVITY VALIDATION SCHEMAS
 *
 * Validation for CRM Activities (Notes, Meetings, Tasks, Calls)
 */

export const CreateActivitySchema = z.object({
  body: z.object({
    type: z.nativeEnum(ActivityType).optional().default("NOTE"),
    subject: z.string().min(1, "El asunto es requerido."),
    description: z.string().optional(),
    status: z
      .enum(["PENDING", "COMPLETED", "CANCELLED"])
      .optional()
      .default("PENDING"),
    dueDate: z
      .string()
      .datetime({ message: "Formato de fecha de vencimiento inválido." })
      .optional()
      .or(z.date().optional()),
    accountId: z.string().cuid("ID de cuenta no válido.").optional().nullable(),
    dealId: z.string().cuid("ID de trato no válido.").optional().nullable(),
    contactId: z.string().optional().nullable(), // Might be complex (phone/CUID/ConversationId) so we leave string
    assignedToId: z
      .string()
      .cuid("ID de usuario asignado no válido.")
      .optional()
      .nullable(),
    participantIds: z
      .array(z.string().cuid("ID de participante no válido."))
      .optional(),
  }),
});

export const UpdateActivitySchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de actividad no válido."),
  }),
  body: z
    .object({
      type: z.nativeEnum(ActivityType).optional(),
      subject: z.string().min(1, "El asunto no puede ser vacío.").optional(),
      description: z.string().optional(),
      status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).optional(),
      dueDate: z.string().datetime().optional().or(z.date().optional()),
      accountId: z
        .string()
        .cuid("ID de cuenta no válido.")
        .optional()
        .nullable(),
      dealId: z.string().cuid("ID de trato no válido.").optional().nullable(),
      contactId: z.string().optional().nullable(),
      assignedToId: z
        .string()
        .cuid("ID de usuario asignado no válido.")
        .optional()
        .nullable(),
      participantIds: z
        .array(z.string().cuid("ID de participante no válido."))
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Debe proporcionar al menos un campo para actualizar.",
    }),
});

export const ActivityIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de actividad no válido"),
  }),
});
