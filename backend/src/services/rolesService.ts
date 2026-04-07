import { UserRole } from "@prisma/client";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import {
  RoleDTO,
  toRoleDTO,
  PermissionModule,
  PermissionAction,
  PermissionDTO,
} from "@/types/role.types";
import { roleRepository } from "@/repositories/RoleRepository";
import { userRepository } from "@/repositories/UserRepository";

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
    const roles = await roleRepository.findMany({
      where: { companyId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: "desc" }, { createdAt: "desc" }],
    });

    return (roles as unknown as Parameters<typeof toRoleDTO>[0][]).map(
      toRoleDTO,
    );
  },

  /**
   * Get single role
   */
  async findOne(companyId: string, roleId: string): Promise<RoleDTO> {
    const role = await roleRepository.findFirst({
      where: { id: roleId, companyId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    if (!role) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);
    return toRoleDTO(role as unknown as Parameters<typeof toRoleDTO>[0]);
  },

  /**
   * Create new role with permissions
   */
  async create(companyId: string, data: CreateRoleParams): Promise<RoleDTO> {
    if (!data.name || !data.baseRole) {
      throw new AppError("Name and baseRole required", HTTP_STATUS.BAD_REQUEST);
    }

    const exists = await roleRepository.findFirst({
      where: { companyId, name: data.name },
    });

    if (exists) {
      throw new AppError("Role name already exists", HTTP_STATUS.BAD_REQUEST);
    }

    const role = await roleRepository.create({
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
    const role = await roleRepository.findFirst({
      where: { id: roleId, companyId },
    });

    if (!role) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);
    if (role.isSystem) {
      throw new AppError("Cannot edit system roles", HTTP_STATUS.FORBIDDEN);
    }

    if (data.name && data.name !== role.name) {
      const conflict = await roleRepository.findFirst({
        where: { companyId, name: data.name, id: { not: roleId } },
      });
      if (conflict) {
        throw new AppError("Role name already exists", HTTP_STATUS.BAD_REQUEST);
      }
    }

    await roleRepository.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description,
        baseRole: data.baseRole as UserRole,
        isActive: data.isActive,
      },
    });

    if (data.permissions) {
      await roleRepository.deleteRolePermissions(roleId);
      await this.syncPermissions(roleId, data.permissions);
    }

    return this.findOne(companyId, roleId);
  },

  /**
   * Delete role
   */
  async delete(companyId: string, roleId: string): Promise<void> {
    const role = (await roleRepository.findFirst({
      where: { id: roleId, companyId },
      include: { _count: { select: { users: true } } },
    })) as unknown as {
      id: string;
      isSystem: boolean;
      _count: { users: number };
    } | null;

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

    await roleRepository.delete(roleId);
  },

  /**
   * Assign role to user
   */
  async assignToUser(
    companyId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    const role = await roleRepository.findFirst({
      where: { id: roleId, companyId },
    });
    if (!role) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);

    const user = await userRepository.findFirst({
      where: { id: userId, companyId },
    });
    if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);

    await userRepository.update(userId, companyId, {
      customRole: { connect: { id: roleId } },
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
    const user = (await userRepository.findFirst({
      where: { id: userId },
      include: {
        customRole: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    })) as unknown as {
      role: string;
      customRole?: {
        permissions: Array<{
          permission: { module: string; action: string; resource: string };
        }>;
      };
    } | null;

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
      let permission = await roleRepository.findPermission({
        where: {
          module: perm.module,
          action: perm.action,
          resource: perm.resource,
        },
      });

      if (!permission) {
        permission = await roleRepository.createPermission({
          data: {
            module: perm.module,
            action: perm.action,
            resource: perm.resource,
          },
        });
      }

      await roleRepository.createRolePermission({
        data: {
          roleId,
          permissionId: permission.id,
        },
      });
    }
  },
};

