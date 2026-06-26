import { UserRole } from "@prisma/client";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";
import {
  RoleDTO,
  toRoleDTO,
  PermissionDTO,
} from "@/types/role.types";
import {
  PermissionModule,
  PermissionAction,
  isValidPermission,
} from "@/constants/permissions";
import { roleRepository } from "@/repositories/RoleRepository";
import { userRepository } from "@/repositories/UserRepository";

interface CreateRoleParams {
  name: string;
  description?: string;
  baseRole: UserRole;
  permissions?: PermissionDTO[];
}

interface UpdateRoleParams {
  name?: string;
  description?: string;
  baseRole?: UserRole;
  permissions?: PermissionDTO[];
  isActive?: boolean;
}

/** Defensa en profundidad: rechaza permisos fuera del catálogo. */
function assertValidPermissions(permissions: PermissionDTO[] | undefined): void {
  if (!permissions) return;
  const invalid = permissions.find(
    (p) => !isValidPermission(p.module, p.action, p.resource),
  );
  if (invalid) {
    throw new AppError(
      `Permiso inválido: ${invalid.module}/${invalid.action}/${invalid.resource}`,
      HTTP_STATUS.BAD_REQUEST,
    );
  }
}

export const rolesService = {
  /**
   * Get all roles for a company
   */
  async findAll(companyId: string): Promise<RoleDTO[]> {
    const roles = await roleRepository.findManyWithPermissions({ companyId });
    return roles.map(toRoleDTO);
  },

  /**
   * Get single role
   */
  async findOne(companyId: string, roleId: string): Promise<RoleDTO> {
    const role = await roleRepository.findFirstWithPermissions({
      id: roleId,
      companyId,
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
    assertValidPermissions(data.permissions);

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
        baseRole: data.baseRole,
        isSystem: false,
        isActive: true,
      },
    });

    if (data.permissions && data.permissions.length > 0) {
      await roleRepository.addPermissions(role.id, data.permissions);
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
    assertValidPermissions(data.permissions);

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
        baseRole: data.baseRole,
        isActive: data.isActive,
      },
    });

    if (data.permissions) {
      await roleRepository.replacePermissions(roleId, data.permissions);
    }

    return this.findOne(companyId, roleId);
  },

  /**
   * Delete role
   */
  async delete(companyId: string, roleId: string): Promise<void> {
    const role = await roleRepository.findWithUserCount({ id: roleId, companyId });

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
    const user = await roleRepository.findUserPermissionContext(userId);

    if (!user) return false;

    // Super Admins tienen acceso total.
    if (user.role === "MASTER" || user.role === "ADMIN") return true;

    // Roles personalizados: match exacto o comodín de recurso "*".
    if (user.customRole) {
      return user.customRole.permissions.some(
        (rp) =>
          rp.permission.module === module &&
          rp.permission.action === action &&
          (rp.permission.resource === resource || rp.permission.resource === "*"),
      );
    }

    // Fallback del Agente: solo lectura de lo propio.
    if (user.role === "AGENT" && action === "VIEW" && resource === "own") {
      return true;
    }

    return false;
  },
};
