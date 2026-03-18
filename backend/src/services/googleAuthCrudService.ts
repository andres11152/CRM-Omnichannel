import { userRepository } from "@/repositories/UserRepository";
import { Logger } from "@/utils/logger";
import bcrypt from "bcryptjs";
import type { UserWithCompany } from "@/types/auth.types";
import { UserRole, Prisma } from "@prisma/client";

/**
 * 🔑 GOOGLE AUTH CRUD SERVICE
 *
 * Data access layer for Google OAuth operations.
 * Handles user lookup/creation for Google login and calendar token management.
 */

export const googleAuthCrudService = {
  /**
   * Find user by email (with company relation)
   */
  async findUserByEmail(email: string): Promise<UserWithCompany | null> {
    const user = await userRepository.findFirst({
      where: { email },
      include: { company: true },
    });
    return user as UserWithCompany | null;
  },

  /**
   * Create a new user with Google OAuth (includes creating a tenant/company)
   */
  async createGoogleUser(data: {
    email: string;
    name: string;
    picture?: string | null;
  }): Promise<UserWithCompany> {
    const randomPassword =
      Math.random().toString(36).slice(-8) +
      Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    const user = await userRepository.create({
      data: {
        email: data.email,
        name: data.name || "Google User",
        password: hashedPassword,
        profilePicUrl: data.picture || null,
        role: UserRole.ADMIN,
        preferences: { googleAuth: true } as Prisma.InputJsonValue,
        company: {
          create: {
            name: `${data.name || "User"}'s Workspace`,
            status: "TRIAL",
            emailProvider: "SMTP",
          },
        },
      },
      include: { company: true },
    });

    Logger.info(`[GoogleAuth] New user created via Google: ${user.email}`);
    return user as UserWithCompany;
  },

  /**
   * Update user profile picture if missing
   */
  async updateProfilePic(userId: string, picture: string) {
    const user = await userRepository.findFirst({ where: { id: userId } });
    if (user?.companyId) {
      await userRepository.update(userId, user.companyId, {
        profilePicUrl: picture,
      });
    }
  },

  /**
   * Save Google Calendar tokens for a user
   */
  async saveCalendarTokens(
    userId: string,
    accessToken: string | null,
    refreshToken: string | null,
  ) {
    const user = await userRepository.findFirst({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    if (!user.companyId) return null;

    await userRepository.update(userId, user.companyId, {
      googleCalendarToken: accessToken,
      googleCalendarRefreshToken: refreshToken,
    });

    return user;
  },

  /**
   * Disconnect Google Calendar (clear tokens)
   */
  async disconnectCalendar(userId: string) {
    const user = await userRepository.findFirst({ where: { id: userId } });
    if (user?.companyId) {
      await userRepository.update(userId, user.companyId, {
        googleCalendarToken: null,
        googleCalendarRefreshToken: null,
      });
    }
  },

  /**
   * Get calendar connection status
   */
  async getCalendarStatus(userId: string) {
    const user = await userRepository.findFirst({
      where: { id: userId },
      select: {
        googleCalendarToken: true,
        googleCalendarRefreshToken: true,
      },
    });

    return !!(user?.googleCalendarToken || user?.googleCalendarRefreshToken);
  },
};
