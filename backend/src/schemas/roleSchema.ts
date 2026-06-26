import { z } from "zod";
import {
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  isValidPermission,
  type PermissionModule,
  type PermissionAction,
} from "@/constants/permissions";

/**
 * [AUTH] ROLE & PERMISSION VALIDATION SCHEMAS
 *
 * Validation for Role-Based Access Control (RBAC) operations.
 * Los permisos se validan contra el catálogo (fuente única) — no se aceptan
 * módulos/acciones/recursos arbitrarios.
 */

const baseRoleSchema = z.enum(["MASTER", "ADMIN", "SUPERVISOR", "AGENT", "USER"], {
  errorMap: () => ({ message: "Rol base inválido." }),
});

const permissionItemSchema = z
  .object({
    module: z.enum(PERMISSION_MODULES as [PermissionModule, ...PermissionModule[]], {
      errorMap: () => ({ message: "Módulo de permiso inválido." }),
    }),
    action: z.enum(PERMISSION_ACTIONS as [PermissionAction, ...PermissionAction[]], {
      errorMap: () => ({ message: "Acción de permiso inválida." }),
    }),
    resource: z.string().min(1, "Recurso requerido."),
  })
  .refine((p) => isValidPermission(p.module, p.action, p.resource), {
    message: "El permiso (módulo/acción/recurso) no existe en el catálogo.",
  });

export const CreateRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre del rol es requerido.").max(60),
    baseRole: baseRoleSchema,
    description: z.string().max(500).optional(),
    permissions: z.array(permissionItemSchema).optional(),
  }),
});

export const UpdateRoleSchema = z.object({
  params: z.object({
    id: z.string().cuid("ID de rol no válido."),
  }),
  body: z
    .object({
      name: z.string().min(1).max(60).optional(),
      baseRole: baseRoleSchema.optional(),
      description: z.string().max(500).optional(),
      isActive: z.boolean().optional(),
      permissions: z.array(permissionItemSchema).optional(),
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
