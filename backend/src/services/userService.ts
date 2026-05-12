import { Prisma } from "@prisma/client";
import { AppError } from "@/utils/AppError";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { Logger } from "@/utils/logger";
import redisClient from "@/config/redis";
import { userRepository } from "@/repositories/UserRepository";

export interface UserFilters {
  companyId?: string;
  role?: string;
  roles?: string[];
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

export const userService = {
  async findUsers(filters: UserFilters) {
    const where = this.buildWhereClause(filters);
    return userRepository.findMany({
      where,
      select: this.getUserSelectFields(),
    });
  },

  async findUserById(id: string, companyId?: string) {
    const user = companyId
      ? await userRepository.findById(id, companyId)
      : await userRepository.findFirst({ where: { id } });

    if (!user) {
      throw new AppError("User not found with provided ID", 404);
    }
    return user;
  },

  async createUser(input: CreateUserInput, currentUserRole: string) {
    const requestedRole = input.role || "AGENT";
    this.validateRoleCreation(currentUserRole, requestedRole);

    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new AppError("Email already registered", 400);
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    const newUser = await userRepository.create({
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

    return this.sanitizeUser(newUser);
  },

  async updateUser(
    input: UpdateUserInput,
    currentUserId: string,
    currentUserRole: string,
    companyId: string,
  ) {
    const { id, preferences, queueIds, role, maxConcurrency, skills, ...restData } = input;

    const canEdit = await this.validateUpdatePermissions(
      id,
      currentUserId,
      currentUserRole,
      companyId,
    );

    if (!canEdit) {
      throw new AppError("Insufficient permissions to edit this profile", 403);
    }

    const currentUser = await userRepository.findById(id, companyId);
    let mergedPreferences = preferences;

    if (currentUser?.preferences && typeof preferences === "object") {
      const currentPrefs = currentUser.preferences as Prisma.JsonObject;
      mergedPreferences = { ...currentPrefs, ...preferences };
    }

    const isAdminEditingAgent = await this.canEditRole(
      id,
      currentUserId,
      currentUserRole,
      companyId,
    );

    const updatedUser = await userRepository.update(
      id,
      companyId,
      {
        ...restData,
        preferences: preferences ? (mergedPreferences as Prisma.InputJsonValue) : undefined,
        role: isAdminEditingAgent && role ? (role as UserRole) : undefined,
        maxConcurrency: maxConcurrency ? Number(maxConcurrency) : undefined,
        skills: skills ? { set: skills } : undefined,
        queues: queueIds ? { set: queueIds.map((qId: string) => ({ id: qId })) } : undefined,
      },
      { queues: true },
    );

    if (redisClient?.isOpen) {
      try {
        await redisClient.del(`auth:user:${id}`);
      } catch (cacheError) {
        Logger.warn(`[UserService] Cache invalidation failed for user ${id}`, cacheError);
      }
    }

    return updatedUser;
  },

  async deleteUser(context: DeleteUserContext) {
    const { userId, currentUserRole, companyId } = context;

    if (currentUserRole !== "ADMIN") {
      throw new AppError("Insufficient permissions to delete users", 403);
    }

    const targetUser = await userRepository.findById(userId, companyId);
    if (!targetUser) {
      throw new AppError("User not found", 404);
    }

    // [SEC] Tenant isolation check
    if (targetUser.companyId !== companyId) {
      throw new AppError("Cross-tenant deletion is forbidden", 403);
    }

    // [SEC] Owner protection logic
    if (targetUser.isOwner) {
      throw new AppError("Account owner cannot be deleted", 403);
    }

    // [SEC] Anti-lockout: Last admin check
    if (targetUser.role === "ADMIN" || targetUser.role === "MASTER") {
      const adminCount = await userRepository.count({
        where: {
          companyId,
          role: { in: ["ADMIN", "MASTER"] as UserRole[] },
        },
      });

      if (adminCount <= 1) {
        throw new AppError("Cannot delete the last administrator", 400);
      }
    }

    await userRepository.delete(userId, companyId);
  },

  buildWhereClause(filters: UserFilters): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (filters.companyId) where.companyId = filters.companyId;

    if (filters.roles && filters.roles.length > 0) {
      const validRoles = filters.roles.filter((r) =>
        Object.values(UserRole).includes(r as UserRole),
      ) as UserRole[];
      if (validRoles.length > 0) where.role = { in: validRoles };
    } else if (filters.role && Object.values(UserRole).includes(filters.role as UserRole)) {
      where.role = filters.role as UserRole;
    } else {
      where.role = { not: UserRole.MASTER };
    }

    // [SEC] Exclude system bots from lists
    where.email = {
      ...((where.email as Prisma.StringFilter) || {}),
      not: { endsWith: "@reply.bot" },
    };

    return where;
  },

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
              updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
          },
        },
      },
      agentSessions: {
        where: { connectedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        select: { connectedAt: true, disconnectedAt: true, duration: true },
      },
      queues: { select: { id: true, name: true } },
    };
  },

  validateRoleCreation(currentUserRole: string, requestedRole: string) {
    if (requestedRole === "MASTER") {
      throw new AppError("MASTER role is reserved for system administrators", 403);
    }

    if (requestedRole === "ADMIN" && currentUserRole !== "MASTER") {
      throw new AppError("Only MASTER users can create ADMIN accounts", 403);
    }

    if (currentUserRole === "SUPERVISOR" && requestedRole !== "AGENT") {
      throw new AppError("Supervisors can only create AGENT accounts", 403);
    }
  },

  async validateUpdatePermissions(
    targetUserId: string,
    currentUserId: string,
    currentUserRole: string,
    companyId: string,
  ): Promise<boolean> {
    if (targetUserId === currentUserId) return true;

    if (currentUserRole === "ADMIN" && companyId) {
      const targetUser = await userRepository.findById(targetUserId, companyId);
      return !!(targetUser && targetUser.companyId === companyId);
    }
    return false;
  },

  async canEditRole(
    targetUserId: string,
    currentUserId: string,
    currentUserRole: string,
    companyId: string,
  ): Promise<boolean> {
    if (currentUserRole !== "ADMIN" || targetUserId === currentUserId) return false;

    const targetUser = await userRepository.findById(targetUserId, companyId);
    if (!targetUser || targetUser.companyId !== companyId) return false;

    return ["AGENT", "SUPERVISOR"].includes(targetUser.role);
  },

  sanitizeUser(user: Prisma.UserGetPayload<object>) {
    const { password: _pw, resetPasswordToken: _rpt, resetPasswordExpires: _rpe, ...sanitized } = user;
    return sanitized;
  },
};
