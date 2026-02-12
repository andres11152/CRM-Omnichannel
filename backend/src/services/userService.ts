import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client"; // Prisma namespace for types like Prisma.UserUpdateInput
import { AppError } from "@/utils/AppError";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import redisClient from "@/config/redis"; // 100-Year Fix: For cache invalidation

// ==================== TYPES & INTERFACES ====================

export interface UserFilters {
  companyId?: string;
  role?: string;
  roles?: string[]; // 🛡️ 100-YEAR FIX: Support multi-role filtering (e.g. Staff Only)
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: string;
  companyId: string;
  maxConcurrency?: number;
  skills?: string[];
}

export interface UpdateUserInput {
  id: string;
  email?: string;
  name?: string;
  preferences?: Record<string, unknown>;
  queueIds?: string[];
  profilePicUrl?: string;
  about?: string;
  phone?: string;
  role?: string;
  maxConcurrency?: number;
  skills?: string[];
}

export interface DeleteUserContext {
  userId: string;
  currentUserRole: string;
  companyId: string;
}

// ==================== USER SERVICE ====================

export const userService = {
  /**
   * FIND USERS
   * Busca usuarios con filtros opcionales
   */
  async findUsers(filters: UserFilters) {
    const where = this.buildWhereClause(filters);

    return prisma.user.findMany({
      where,
      select: this.getUserSelectFields(),
    });
  },

  /**
   * FIND USER BY ID
   * Obtiene un usuario específico por ID
   */
  async findUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError("No se encontró un usuario con ese ID", 404);
    }

    return user;
  },

  /**
   * CREATE USER
   * Crea un nuevo usuario con validaciones de rol
   */
  async createUser(input: CreateUserInput, currentUserRole: string) {
    const requestedRole = input.role || "AGENT";

    // Validar permisos de creación de rol
    this.validateRoleCreation(currentUserRole, requestedRole);

    // Verificar si el email ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new AppError("El email ya está registrado.", 400);
    }

    // Hash de password
    const hashedPassword = await bcrypt.hash(input.password, 12);

    // Crear usuario
    const newUser = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: hashedPassword,
        companyId: input.companyId,
        role: requestedRole as UserRole,
        maxConcurrency: input.maxConcurrency || 3,
        skills: Array.isArray(input.skills) ? input.skills : [],
      } as Prisma.UserCreateInput,
    });

    // Remover password del output
    return this.sanitizeUser(newUser);
  },

  /**
   * UPDATE USER
   * Actualiza un usuario con validaciones de permisos
   */
  async updateUser(
    input: UpdateUserInput,
    currentUserId: string,
    currentUserRole: string,
    companyId: string,
  ) {
    const {
      id,
      preferences,
      queueIds,
      role,
      maxConcurrency,
      skills,
      ...restData
    } = input;

    // Validar permisos de edición
    const canEdit = await this.validateUpdatePermissions(
      id,
      currentUserId,
      currentUserRole,
      companyId,
    );

    if (!canEdit) {
      throw new AppError("No tienes permiso para editar este perfil.", 403);
    }

    // Obtener usuario actual para merge de preferences
    const currentUser = await prisma.user.findUnique({ where: { id } });

    // Merge preferences si existen
    let mergedPreferences = preferences;
    if (currentUser?.preferences && typeof preferences === "object") {
      const currentPrefs = currentUser.preferences as Record<string, unknown>;
      mergedPreferences = {
        ...currentPrefs,
        ...preferences,
      };
    }

    // Determinar si el usuario actual puede cambiar roles
    const isAdminEditingAgent = await this.canEditRole(
      id,
      currentUserId,
      currentUserRole,
      companyId,
    );

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...restData,
        preferences: preferences ? mergedPreferences : undefined,
        role: isAdminEditingAgent && role ? (role as UserRole) : undefined,
        maxConcurrency: maxConcurrency ? Number(maxConcurrency) : undefined,
        skills: skills ? { set: skills } : undefined,
        queues: queueIds
          ? {
              set: queueIds.map((qId: string) => ({ id: qId })),
            }
          : undefined,
      } as Prisma.UserUpdateInput,
      include: {
        queues: true,
      },
    });

    // 100-Year Fix: Invalidate Redis cache so auth middleware serves fresh data
    if (redisClient?.isOpen) {
      try {
        await redisClient.del(`auth:user:${id}`);
      } catch (cacheError) {
        console.warn(
          `[UserService] Failed to invalidate cache for user ${id}:`,
          cacheError,
        );
      }
    }

    return updatedUser;
  },

  /**
   * DELETE USER
   * Elimina un usuario con validaciones de seguridad
   */
  async deleteUser(context: DeleteUserContext) {
    const { userId, currentUserRole, companyId } = context;

    // Solo ADMIN puede eliminar usuarios de su compañía
    if (currentUserRole === "ADMIN") {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!targetUser) {
        throw new AppError("Usuario no encontrado", 404);
      }

      // Validar que pertenece a la misma compañía
      if (targetUser.companyId !== companyId) {
        throw new AppError(
          "No tienes permiso para eliminar usuarios de otra compañía.",
          403,
        );
      }

      // 🛡️ SECURITY: Owner Protection
      if (targetUser.isOwner) {
        throw new AppError(
          "El Dueño (Owner) de la cuenta no puede ser eliminado.",
          403,
        );
      }

      // 🛡️ SECURITY: Last Man Standing (Anti-Lockout)
      if (targetUser.role === "ADMIN" || targetUser.role === "MASTER") {
        const adminCount = await prisma.user.count({
          where: {
            companyId,
            role: { in: ["ADMIN", "MASTER"] },
          },
        });

        if (adminCount <= 1) {
          throw new AppError(
            "No puedes eliminar al último Administrador. Asigna otro Admin antes de borrar este.",
            400,
          );
        }
      }

      // Eliminar usuario
      await prisma.user.delete({ where: { id: userId } });
      return;
    }

    // Fallback: Si no es ADMIN, solo puede eliminarse a sí mismo
    // (Esta lógica podría estar en middleware de autorización)
    throw new AppError("No tienes permiso para eliminar usuarios.", 403);
  },

  // ==================== HELPER METHODS ====================

  /**
   * BUILD WHERE CLAUSE
   * Construye la cláusula WHERE para queries
   */
  buildWhereClause(filters: UserFilters): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    if (filters.companyId) {
      where.companyId = filters.companyId;
    }

    // 🛡️ 100-YEAR FIX: Prioritize multi-role filter for robust lists
    if (filters.roles && filters.roles.length > 0) {
      const validRoles = filters.roles.filter((r) =>
        Object.values(UserRole).includes(r as UserRole),
      ) as UserRole[];
      if (validRoles.length > 0) {
        where.role = { in: validRoles };
      }
    } else if (
      filters.role &&
      Object.values(UserRole).includes(filters.role as UserRole)
    ) {
      where.role = filters.role as UserRole;
    } else {
      // 🛡️ 100-YEAR FIX: Global MASTER Exclusion
      // Master users (God Mode) should never appear in standard lists (transfer, admin views, etc.)
      where.role = { not: UserRole.MASTER };
    }

    // 🛡️ 100-YEAR FIX: Exclude System Bots (Flow/AI Agents)
    // These internal accounts should never be selectable for assignment or displayed in lists.
    where.email = {
      ...((where.email as Prisma.StringFilter) || {}), // Preserve existing email filters if any (future proof)
      not: {
        endsWith: "@reply.bot",
      },
    };

    return where;
  },

  /**
   * GET USER SELECT FIELDS
   * Devuelve los campos que deben ser seleccionados (excluye password)
   */
  getUserSelectFields() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      createdAt: true,
      maxConcurrency: true,
      skills: true,
      isOwner: true,
      lastSeen: true,
      isOnline: true,
      _count: {
        select: {
          assignedTickets: {
            where: {
              status: "RESOLVED",
              updatedAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          },
        },
      },
      agentSessions: {
        where: {
          connectedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        select: {
          connectedAt: true,
          disconnectedAt: true,
          duration: true,
        },
      },
      queues: {
        select: {
          id: true,
          name: true,
        },
      },
    };
  },

  /**
   * VALIDATE ROLE CREATION
   * Valida si el usuario actual puede crear el rol solicitado
   */
  validateRoleCreation(currentUserRole: string, requestedRole: string) {
    // 1. Nadie puede crear MASTER (solo system setup)
    if (requestedRole === "MASTER") {
      throw new AppError(
        "No se pueden crear usuarios MASTER. Este rol está reservado para administradores del sistema.",
        403,
      );
    }

    // 2. Solo MASTER puede crear ADMIN
    if (requestedRole === "ADMIN" && currentUserRole !== "MASTER") {
      throw new AppError(
        "Solo los usuarios MASTER pueden crear administradores (ADMIN).",
        403,
      );
    }

    // 3. SUPERVISOR solo puede crear AGENT
    if (currentUserRole === "SUPERVISOR" && requestedRole !== "AGENT") {
      throw new AppError(
        "Los supervisores solo pueden crear agentes (AGENT).",
        403,
      );
    }

    // ADMIN puede crear ADMIN, SUPERVISOR, AGENT (implícitamente permitido)
  },

  /**
   * VALIDATE UPDATE PERMISSIONS
   * Valida si el usuario actual puede editar al usuario objetivo
   */
  async validateUpdatePermissions(
    targetUserId: string,
    currentUserId: string,
    currentUserRole: string,
    companyId: string,
  ): Promise<boolean> {
    // Permitir si es el mismo usuario
    const isSelf = targetUserId === currentUserId;
    if (isSelf) return true;

    // Permitir si es ADMIN editando AGENT o SUPERVISOR de su compañía
    if (currentUserRole === "ADMIN" && companyId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      });

      if (
        targetUser &&
        targetUser.companyId === companyId &&
        ["AGENT", "SUPERVISOR"].includes(targetUser.role)
      ) {
        return true;
      }
    }

    return false;
  },

  /**
   * CAN EDIT ROLE
   * Determina si el usuario actual puede cambiar el rol del usuario objetivo
   */
  async canEditRole(
    targetUserId: string,
    currentUserId: string,
    currentUserRole: string,
    companyId: string,
  ): Promise<boolean> {
    // Solo ADMINs pueden cambiar roles
    if (currentUserRole !== "ADMIN") return false;

    // No puede cambiar su propio rol
    if (targetUserId === currentUserId) return false;

    // Validar que el usuario objetivo está en la misma compañía
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || targetUser.companyId !== companyId) {
      return false;
    }

    // Solo puede cambiar roles de AGENT y SUPERVISOR
    return ["AGENT", "SUPERVISOR"].includes(targetUser.role);
  },

  /**
   * SANITIZE USER
   * Remueve campos sensibles del objeto usuario
   */
  sanitizeUser(user: Prisma.UserGetPayload<object>) {
    // Explicitly omit sensitive fields using destructure + rest
    const {
      password: _pw,
      resetPasswordToken: _rpt,
      resetPasswordExpires: _rpe,
      ...sanitized
    } = user;
    // Consume unused vars to satisfy strict linters (intentional omission pattern)
    [_pw, _rpt, _rpe]; // eslint-disable-line @typescript-eslint/no-unused-expressions
    return sanitized;
  },
};
