import { userRepository } from "@/repositories/UserRepository";
import { AppError } from "@/utils/AppError";
import { auditLogService } from "@/services/auditLogService";
import { Logger } from "@/utils/logger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import TenantContextManager from "@/config/tenantContext";
import type { UserWithCompanyAndPlan } from "@/types/auth.types";

/**
 * 🔐 AUTH CRUD SERVICE
 *
 * Data access layer for authentication operations.
 * Handles user lookup, creation, password hashing, and token management.
 */

interface SignupData {
  name: string;
  email: string;
  password: string;
  companyId?: string;
}

export const authCrudService = {
  /**
   * Create a new user (signup)
   */
  async createUser(data: SignupData) {
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const newUser = await userRepository.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        companyId: data.companyId || undefined,
        role: data.companyId ? "AGENT" : "ADMIN",
      },
    });

    Logger.info(`[Auth] User created: ${newUser.email} (${newUser.id})`);
    return newUser;
  },

  /**
   * Find user by email for login (includes company + plan)
   */
  async findUserByEmail(email: string): Promise<UserWithCompanyAndPlan | null> {
    const user = await TenantContextManager.runAsSystem(async () =>
      userRepository.findUnique({
        where: { email },
        include: {
          company: {
            include: { plan: true },
          },
        },
      }),
    );
    return user as UserWithCompanyAndPlan | null;
  },

  /**
   * Verify password against stored hash
   */
  async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  },

  /**
   * Find user by ID
   */
  async findUserById(id: string) {
    return await userRepository.findUnique({ where: { id } });
  },

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await userRepository.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // 🕵️‍♂️ Log sensitive action
    const userForAudit = await userRepository.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (userForAudit?.companyId) {
      void auditLogService.log({
        companyId: userForAudit.companyId,
        userId: userId,
        action: "UPDATE",
        entity: "User",
        entityId: userId,
        details: { event: "Password changed manually" },
      });
    }
  },

  /**
   * Generate and store password reset token
   */
  async generateResetToken(email: string) {
    const user = await TenantContextManager.runAsSystem(async () =>
      userRepository.findUnique({ where: { email } }),
    );

    if (!user) {
      throw new AppError("No existe usuario con ese email.", 404);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const passwordResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await userRepository.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: passwordResetToken,
        resetPasswordExpires: passwordResetExpires,
      },
    });

    return { user, resetToken };
  },

  /**
   * Clear reset token (on error or after use)
   */
  async clearResetToken(userId: string) {
    await userRepository.update({
      where: { id: userId },
      data: { resetPasswordToken: null, resetPasswordExpires: null },
    });
  },

  /**
   * Find user by reset token and validate expiry, then reset password
   */
  async resetPasswordWithToken(token: string, newPassword: string) {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await TenantContextManager.runAsSystem(async () =>
      userRepository.findFirst({
        where: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: { gt: new Date() },
        },
        include: { company: true },
      }),
    );

    if (!user) {
      throw new AppError("Token inválido o expirado.", 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await userRepository.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    // 🕵️‍♂️ Log sensitive action
    if (user.companyId) {
      void auditLogService.log({
        companyId: user.companyId,
        userId: user.id,
        action: "UPDATE",
        entity: "User",
        entityId: user.id,
        details: { event: "Password reset via token" },
      });
    }

    return user;
  },
};
