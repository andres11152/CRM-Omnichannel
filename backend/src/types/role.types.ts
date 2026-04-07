import { Role, Permission, RolePermission } from "@prisma/client";

/**
 * [SEC] PERMISSION CONSTANTS
 */
export type PermissionModule =
  | "CONVERSATIONS"
  | "TICKETS"
  | "CONTACTS"
  | "DEALS"
  | "ACTIVITIES"
  | "CAMPAIGNS"
  | "REPORTS"
  | "SETTINGS"
  | "TEAM"
  | "INTEGRATIONS"
  | "MEDIA"
  | "FLOWS"
  | "PRODUCTS"
  | "QUEUES";

export type PermissionAction =
  | "VIEW"
  | "CREATE"
  | "EDIT"
  | "DELETE"
  | "ASSIGN"
  | "EXPORT"
  | "IMPORT"
  | "MANAGE";

/**
 * [PKG] DTOs
 */
export interface PermissionDTO {
  id: string;
  module: PermissionModule;
  action: PermissionAction;
  resource: string;
}

export interface RoleDTO {
  id: string;
  name: string;
  description: string | null;
  baseRole: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: PermissionDTO[];
  _count?: { users: number };
  createdAt: string;
  updatedAt: string;
}

/**
 * [SYNC] MAPPERS
 */
export const toPermissionDTO = (perm: Permission): PermissionDTO => ({
  id: perm.id,
  module: perm.module as PermissionModule,
  action: perm.action as PermissionAction,
  resource: perm.resource,
});

export const toRoleDTO = (
  role: Role & {
    permissions: (RolePermission & { permission: Permission })[];
    _count?: { users: number };
  },
): RoleDTO => ({
  id: role.id,
  name: role.name,
  description: role.description,
  baseRole: role.baseRole,
  isSystem: role.isSystem,
  isActive: role.isActive,
  permissions: role.permissions.map((rp) => toPermissionDTO(rp.permission)),
  _count: role._count,
  createdAt: role.createdAt.toISOString(),
  updatedAt: role.updatedAt.toISOString(),
});
