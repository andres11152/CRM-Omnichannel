import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";
import { permissionKey, type PermissionModule, type PermissionAction } from "@/constants/permissions";

/** Include estándar para devolver un rol con sus permisos y conteo de usuarios. */
const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

/** Rol con permisos + conteo (tipado, sin casts en el servicio). */
export type RoleWithPermissions = Prisma.RoleGetPayload<{ include: typeof ROLE_INCLUDE }>;

export interface PermissionInput {
  module: PermissionModule;
  action: PermissionAction;
  resource: string;
}

export class RoleRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  findManyWithPermissions(where: Prisma.RoleWhereInput): Promise<RoleWithPermissions[]> {
    return this.db.role.findMany({
      where,
      include: ROLE_INCLUDE,
      orderBy: [{ isSystem: "desc" }, { createdAt: "desc" }],
    });
  }

  findFirstWithPermissions(where: Prisma.RoleWhereInput): Promise<RoleWithPermissions | null> {
    return this.db.role.findFirst({ where, include: ROLE_INCLUDE });
  }

  findFirst(args: Prisma.RoleFindFirstArgs) {
    return this.db.role.findFirst(args);
  }

  create(args: Prisma.RoleCreateArgs) {
    return this.db.role.create(args);
  }

  update(args: Prisma.RoleUpdateArgs) {
    return this.db.role.update(args);
  }

  /** Rol con el conteo de usuarios (para validar borrado seguro). */
  findWithUserCount(
    where: Prisma.RoleWhereInput,
  ): Promise<(Prisma.RoleGetPayload<{ include: { _count: { select: { users: true } } } }>) | null> {
    return this.db.role.findFirst({
      where,
      include: { _count: { select: { users: true } } },
    });
  }

  delete(id: string) {
    return this.db.role.delete({ where: { id } });
  }

  /**
   * Contexto de permisos efectivos de un usuario (rol base + rol custom con sus
   * permisos). Tipado vía `select` — sin casts en el servicio.
   */
  findUserPermissionContext(userId: string) {
    return this.db.user.findFirst({
      where: { id: userId },
      select: {
        role: true,
        customRole: {
          select: {
            permissions: {
              select: {
                permission: { select: { module: true, action: true, resource: true } },
              },
            },
          },
        },
      },
    });
  }

  // ── Sincronización de permisos (transaccional, por lotes) ──

  /** Reemplaza TODOS los permisos del rol por el set dado (atómico). */
  async replacePermissions(roleId: string, perms: PermissionInput[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await this.linkPermissions(tx, roleId, perms);
    });
  }

  /** Agrega permisos al rol (atómico). */
  async addPermissions(roleId: string, perms: PermissionInput[]): Promise<void> {
    if (perms.length === 0) return;
    await this.db.$transaction(async (tx) => {
      await this.linkPermissions(tx, roleId, perms);
    });
  }

  /**
   * Crea (si faltan) los permisos atómicos y los vincula al rol — todo por lotes,
   * sin N+1. Idempotente gracias a los unique constraints + skipDuplicates.
   */
  private async linkPermissions(
    tx: Pick<ExtendedPrismaClient, "permission" | "rolePermission">,
    roleId: string,
    perms: PermissionInput[],
  ): Promise<void> {
    if (perms.length === 0) return;

    // Deduplicar el set entrante.
    const uniqueByKey = new Map<string, PermissionInput>();
    for (const p of perms) {
      uniqueByKey.set(permissionKey(p.module, p.action, p.resource), p);
    }
    const unique = [...uniqueByKey.values()];
    const orFilter = unique.map((p) => ({
      module: p.module,
      action: p.action,
      resource: p.resource,
    }));

    // Crear en bloque las que falten (skipDuplicates respeta el @@unique).
    await tx.permission.createMany({ data: unique, skipDuplicates: true });

    // Recuperar los IDs de todos los permisos del set.
    const allPerms = await tx.permission.findMany({ where: { OR: orFilter } });

    // Vincular en bloque (skipDuplicates respeta @@unique([roleId, permissionId])).
    await tx.rolePermission.createMany({
      data: allPerms.map((p) => ({ roleId, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}

export const roleRepository = new RoleRepository();
