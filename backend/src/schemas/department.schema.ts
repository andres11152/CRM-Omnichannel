import { z } from "zod";

/**
 * 🏢 DEPARTMENT VALIDATION SCHEMAS
 *
 * Validation for departments
 */

export const CreateDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre del departamento es requerido."),
  }),
});

export const UpdateDepartmentSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de departamento no válido."),
  }),
  body: z
    .object({
      name: z.string().min(1, "El nombre no puede estar vacío.").optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Debe proporcionar al menos un campo para actualizar.",
    }),
});

export const DepartmentIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de departamento no válido."),
  }),
});
