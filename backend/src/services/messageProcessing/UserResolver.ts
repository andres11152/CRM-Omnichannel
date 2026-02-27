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
 * 👤 USER RESOLVER
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

    return userRepository.upsert(
      { email: userEmail },
      {
        company: { connect: { id: companyId } },
        email: userEmail,
        name: identity.subjectDisplayName,
        phone,
        role: UserRole.USER,
        password: await bcrypt.hash(phone, 10),
        profilePicUrl,
        about,
      },
      updateData,
    );
  }
}

export const userResolver = new UserResolver();
