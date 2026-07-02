import { User, UserRole, Prisma } from "@prisma/client";
import { userRepository } from "@/repositories/UserRepository";
import bcrypt from "bcryptjs";
import { Logger } from "@/utils/logger";
import type { IdentityResult } from "@/utils/contactStrategy";

export interface UserResolverParams {
  companyId: string;
  phone: string;
  identity: IdentityResult;
  isOutbound: boolean;
  profilePicUrl?: string;
  about?: string;
}

/**
 *  USER RESOLVER
 *
 * Single Responsibility: Upserts a shadow User record for WhatsApp contacts.
 * Each WhatsApp phone gets a corresponding User (email: phone@whatsapp.user).
 */
export class UserResolver {
  async resolve(params: UserResolverParams): Promise<User> {
    const { companyId, phone, identity, isOutbound, profilePicUrl, about } =
      params;

    const userEmail = `${phone}@whatsapp.user`;

    const updateData: Prisma.UserUpdateInput = { phone };
    if (!isOutbound) {
      updateData.name = identity.subjectDisplayName;
      if (profilePicUrl) updateData.profilePicUrl = profilePicUrl;
      if (about) updateData.about = about;
    }

    Logger.debug(`[UserResolver] Upserting user for: ${phone}`);

    const doUpsert = async (email: string) =>
      userRepository.upsert({
        where: { email },
        create: {
          company: { connect: { id: companyId } },
          email,
          name: identity.subjectDisplayName,
          phone,
          role: UserRole.USER,
          password: await bcrypt.hash(phone, 10),
          profilePicUrl,
          about,
        },
        update: updateData,
      });

    try {
      return await doUpsert(userEmail);
    } catch (error: unknown) {
      const isUnique =
        error instanceof Error &&
        error.message.includes("Unique constraint failed");
      if (!isUnique) throw error;

      // [SEC] 100-YEAR FIX (multi-tenant collision): User.email is globally
      // unique but shadow emails are phone-derived. If this phone already has
      // a shadow user under ANOTHER company, the RLS-scoped upsert takes the
      // CREATE branch and hits P2002 forever. Fall back to this company's own
      // row (legacy or scoped) or create a company-scoped email. Same pattern
      // as ChatIdentityService.upsertWhatsAppUser.
      const scopedEmail = `${phone}.${companyId}@whatsapp.user`;
      const own = await userRepository.findFirst({
        where: { email: { in: [userEmail, scopedEmail] }, companyId },
      });
      if (own) {
        return userRepository.update(own.id, companyId, updateData);
      }
      Logger.info(
        `[UserResolver] Cross-tenant email collision for ${userEmail} — creating scoped shadow user`,
      );
      return doUpsert(scopedEmail);
    }
  }
}

export const userResolver = new UserResolver();
