import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

export class RoleRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  async findMany(args: Prisma.RoleFindManyArgs) {
    return this.db.role.findMany(args);
  }

  async findFirst(args: Prisma.RoleFindFirstArgs) {
    return this.db.role.findFirst(args);
  }

  async create(args: Prisma.RoleCreateArgs) {
    return this.db.role.create(args);
  }

  async update(args: Prisma.RoleUpdateArgs) {
    return this.db.role.update(args);
  }

  async delete(id: string) {
    return this.db.role.delete({ where: { id } });
  }

  // ── Permission helpers ──

  async findPermission(args: Prisma.PermissionFindFirstArgs) {
    return this.db.permission.findFirst(args);
  }

  async createPermission(args: Prisma.PermissionCreateArgs) {
    return this.db.permission.create(args);
  }

  async createRolePermission(args: Prisma.RolePermissionCreateArgs) {
    return this.db.rolePermission.create(args);
  }

  async deleteRolePermissions(roleId: string) {
    return this.db.rolePermission.deleteMany({ where: { roleId } });
  }
}

export const roleRepository = new RoleRepository();
