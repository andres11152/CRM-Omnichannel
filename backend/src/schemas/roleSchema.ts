import { z } from "zod";

/**
 * [AUTH] ROLE & PERMISSION VALIDATION SCHEMAS
 *
 * Validation for Role-Based Access Control (RBAC) operations
 */

export const CreateRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre del rol es requerido."),
    baseRole: z.enum(["MASTER", "ADMIN", "SUPERVISOR", "AGENT", "USER"], {
      errorMap: () => ({ message: "Rol base inválido." }),
    }),
    description: z.string().optional(),
    permissions: z
      .array(
        z.object({
          module: z.string(),
          action: z.string(),
          resource: z.string(),
        }),
      )
      .optional(),
  }),
});

export const UpdateRoleSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de rol no válido."),
  }),
  body: z
    .object({
      name: z.string().min(1).optional(),
      baseRole: z
        .enum(["MASTER", "ADMIN", "SUPERVISOR", "AGENT", "USER"])
        .optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
      permissions: z
        .array(
          z.object({
            module: z.string(),
            action: z.string(),
            resource: z.string(),
          }),
        )
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "Debe proporcionar al menos un campo para actualizar.",
    }),
});

export const AssignRoleSchema = z.object({
  body: z.object({
    userId: z.string().cuid("ID de usuario no válido."),
    roleId: z.string().cuid("ID de rol no válido."),
  }),
});

export const RoleIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de rol no válido."),
  }),
});
