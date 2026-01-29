import { prisma } from "@/config/database";
import { UserRole } from "@prisma/client";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import {
  RoleDTO,
  toRoleDTO,
  PermissionModule,
  PermissionAction,
  PermissionDTO,
} from "@/dtos/role.dto";

interface CreateRoleParams {
  name: string;
  description?: string;
  baseRole: string;
  permissions?: PermissionDTO[];
}

interface UpdateRoleParams {
  name?: string;
  description?: string;
  baseRole?: string;
  permissions?: PermissionDTO[];
  isActive?: boolean;
}

export const rolesService = {
  /**
   * Get all roles for a company
   */
  async findAll(companyId: string): Promise<RoleDTO[]> {
    const roles = await prisma.role.findMany({
      where: { companyId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: "desc" }, { createdAt: "desc" }],
    });

    return roles.map(toRoleDTO);
  },

  /**
   * Get single role
   */
  async findOne(companyId: string, roleId: string): Promise<RoleDTO> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, companyId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    if (!role) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);
    return toRoleDTO(role);
  },

  /**
   * Create new role with permissions
   */
  async create(companyId: string, data: CreateRoleParams): Promise<RoleDTO> {
    if (!data.name || !data.baseRole) {
      throw new AppError("Name and baseRole required", HTTP_STATUS.BAD_REQUEST);
    }

    const exists = await prisma.role.findFirst({
      where: { companyId, name: data.name },
    });

    if (exists) {
      throw new AppError("Role name already exists", HTTP_STATUS.BAD_REQUEST);
    }

    const role = await prisma.role.create({
      data: {
        companyId,
        name: data.name,
        description: data.description,
        baseRole: data.baseRole as UserRole,
        isSystem: false,
        isActive: true,
      },
    });

    if (data.permissions && data.permissions.length > 0) {
      await this.syncPermissions(role.id, data.permissions);
    }

    return this.findOne(companyId, role.id);
  },

  /**
   * Update role
   */
  async update(
    companyId: string,
    roleId: string,
    data: UpdateRoleParams,
  ): Promise<RoleDTO> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, companyId },
    });

    if (!role) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);
    if (role.isSystem) {
      throw new AppError("Cannot edit system roles", HTTP_STATUS.FORBIDDEN);
    }

    if (data.name && data.name !== role.name) {
      const conflict = await prisma.role.findFirst({
        where: { companyId, name: data.name, id: { not: roleId } },
      });
      if (conflict) {
        throw new AppError("Role name already exists", HTTP_STATUS.BAD_REQUEST);
      }
    }

    await prisma.role.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description,
        baseRole: data.baseRole as UserRole,
        isActive: data.isActive,
      },
    });

    if (data.permissions) {
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await this.syncPermissions(roleId, data.permissions);
    }

    return this.findOne(companyId, roleId);
  },

  /**
   * Delete role
   */
  async delete(companyId: string, roleId: string): Promise<void> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, companyId },
      include: { _count: { select: { users: true } } },
    });

    if (!role) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);
    if (role.isSystem) {
      throw new AppError("Cannot delete system roles", HTTP_STATUS.FORBIDDEN);
    }
    if (role._count.users > 0) {
      throw new AppError(
        `Cannot delete role with ${role._count.users} active users`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    await prisma.role.delete({ where: { id: roleId } });
  },

  /**
   * Assign role to user
   */
  async assignToUser(
    companyId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    const role = await prisma.role.findFirst({
      where: { id: roleId, companyId },
    });
    if (!role) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);

    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
    });
    if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);

    await prisma.user.update({
      where: { id: userId },
      data: { customRoleId: roleId },
    });
  },

  /**
   * Check User Permission Logic
   */
  async checkPermission(
    userId: string,
    module: PermissionModule,
    action: PermissionAction,
    resource: string,
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customRole: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user) return false;

    // Super Admins
    if (user.role === "MASTER" || user.role === "ADMIN") return true;

    // Custom Roles
    if (user.customRole) {
      return user.customRole.permissions.some(
        (rp) =>
          rp.permission.module === module &&
          rp.permission.action === action &&
          (rp.permission.resource === resource ||
            rp.permission.resource === "*"),
      );
    }

    // Default Agent Fallback
    if (user.role === "AGENT") {
      if (action === "VIEW" && resource === "own") return true;
    }

    return false;
  },

  /**
   * Helper: Sync permissions (FindOrCreate)
   */
  async syncPermissions(roleId: string, permissions: PermissionDTO[]) {
    for (const perm of permissions) {
      // Find or create permission
      // Optimization: Could be cached in memory
      let permission = await prisma.permission.findFirst({
        where: {
          module: perm.module,
          action: perm.action,
          resource: perm.resource,
        },
      });

      if (!permission) {
        permission = await prisma.permission.create({
          data: {
            module: perm.module,
            action: perm.action,
            resource: perm.resource,
          },
        });
      }

      await prisma.rolePermission.create({
        data: {
          roleId,
          permissionId: permission.id,
        },
      });
    }
  },
};
