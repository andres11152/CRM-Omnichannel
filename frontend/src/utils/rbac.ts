import { Permission } from "@/types/permissions";

/**
 * [SEC] RBAC Frontend Utilities
 * Client-side permission checking (must match backend)
 */

export const RolePermissions: Record<string, Permission[]> = {
  master: [
    // Masters have ALL permissions
    "user:create",
    "user:read",
    "user:update",
    "user:delete",
    "company:read",
    "company:update",
    "company:delete",
    "company:settings",
    "conversation:read",
    "conversation:create",
    "conversation:assign",
    "message:send",
    "message:delete",
    "ticket:read",
    "ticket:create",
    "ticket:update",
    "ticket:assign",
    "ticket:resolve",
    "queue:read",
    "queue:create",
    "queue:update",
    "queue:delete",
    "whatsapp:connect",
    "whatsapp:disconnect",
    "whatsapp:send",
    "campaign:read",
    "campaign:create",
    "campaign:update",
    "campaign:delete",
    "campaign:send",
    "ai:config",
    "ai:use",
    "contact:read",
    "contact:create",
    "contact:update",
    "contact:delete",
    "deal:read",
    "deal:create",
    "deal:update",
    "deal:delete",
    "analytics:view",
    "analytics:export",
    "billing:view",
    "billing:manage",
    "admin:impersonate",
    "admin:manage_tenants",
    "admin:manage_plans",
    "admin:view_system",
  ] as Permission[],

  company_admin: [
    "user:create",
    "user:read",
    "user:update",
    "user:delete",
    "company:read",
    "company:update",
    "company:settings",
    "conversation:read",
    "conversation:create",
    "conversation:assign",
    "message:send",
    "message:delete",
    "ticket:read",
    "ticket:create",
    "ticket:update",
    "ticket:assign",
    "ticket:resolve",
    "queue:read",
    "queue:create",
    "queue:update",
    "queue:delete",
    "whatsapp:connect",
    "whatsapp:disconnect",
    "whatsapp:send",
    "campaign:read",
    "campaign:create",
    "campaign:update",
    "campaign:delete",
    "campaign:send",
    "ai:config",
    "ai:use",
    "contact:read",
    "contact:create",
    "contact:update",
    "contact:delete",
    "deal:read",
    "deal:create",
    "deal:update",
    "deal:delete",
    "analytics:view",
    "analytics:export",
    "billing:view",
    "billing:manage",
  ] as Permission[],

  agent: [
    "user:read",
    "conversation:read",
    "message:send",
    "ticket:read",
    "ticket:update",
    "ticket:resolve",
    "queue:read",
    "whatsapp:send",
    "ai:use",
    "contact:read",
    "contact:create",
    "contact:update",
    "deal:read",
    "deal:create",
    "deal:update",
  ] as Permission[],
};

/**
 * Check if current user has a specific permission
 */
export const hasPermission = (
  userRole: string,
  permission: Permission
): boolean => {
  const permissions = RolePermissions[userRole] || [];
  return permissions.includes(permission);
};

/**
 * Check if current user has ANY of the specified permissions
 */
export const hasAnyPermission = (
  userRole: string,
  permissions: Permission[]
): boolean => {
  return permissions.some((p) => hasPermission(userRole, p));
};

/**
 * Check if current user has ALL of the specified permissions
 */
export const hasAllPermissions = (
  userRole: string,
  permissions: Permission[]
): boolean => {
  return permissions.every((p) => hasPermission(userRole, p));
};

/**
 * React Hook for permission checking
 */
export const usePermissions = (userRole: string) => {
  return {
    can: (permission: Permission) => hasPermission(userRole, permission),
    canAny: (permissions: Permission[]) =>
      hasAnyPermission(userRole, permissions),
    canAll: (permissions: Permission[]) =>
      hasAllPermissions(userRole, permissions),
  };
};
