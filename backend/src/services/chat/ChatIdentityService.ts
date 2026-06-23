import { Prisma } from "@prisma/client";
import { contactService } from "@/services/ContactService";
import { Logger } from "@/utils/logger";
import { userRepository } from "@/repositories/UserRepository";
import { contactRepository } from "@/repositories/ContactRepository";
import { WhatsAppIdUtils } from "@/whatsapp/utils/WhatsAppIdUtils";
import { companySettingsService } from "@/services/CompanySettingsService";

/**
 * [CHAT] CHAT IDENTITY SERVICE
 * Handles user and contact resolution and synchronization from WhatsApp to the CRM.
 */
export class ChatIdentityService {
  /**
   * Find a user strictly by phone number (fuzzy match last 10 digits)
   */
  async findUserByPhone(
    companyId: string,
    phone: string,
    excludeEmail?: string,
  ) {
    if (!phone) return null;
    const nationalNumber = phone.length > 10 ? phone.slice(-10) : phone;

    return userRepository.findFirst({
      where: {
        companyId,
        OR: [{ phone: phone }, { phone: { endsWith: nationalNumber } }],
        ...(excludeEmail ? { NOT: { email: excludeEmail } } : {}),
      },
    });
  }

  /**
   * Find user by Name (LID strategy)
   */
  async findUserByName(companyId: string, name: string) {
    return userRepository.findFirst({
      where: {
        companyId,
        name: name,
        email: { endsWith: "@whatsapp.user" },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Find CRM Contact by Phone (Helper for MessageHandler)
   */
  async findContact(companyId: string, phone: string) {
    return contactRepository.findFirst({
      where: { companyId, phone, deletedAt: null },
    });
  }

  /**
   * Create or Update a WhatsApp "Shadow" User & Sync with CRM Contact
   */
  async upsertWhatsAppUser(params: {
    email: string;
    name: string;
    companyId: string;
    phone?: string | null;
    role?: "USER" | "AGENT" | "ADMIN" | "MASTER";
  }) {
    let nameToPersist = params.name;
    let user;

    try {
      // 0. Name Preservation
      const existingUser = await userRepository.findFirst({
        where: { email: params.email, companyId: params.companyId },
        select: { id: true, name: true },
      });

      if (existingUser) {
        const isNewNamePhone = /^\+?\d[\d\s-]*$/.test(params.name);
        const isOldNamePhone = /^\+?\d[\d\s-]*$/.test(existingUser.name);

        if (isNewNamePhone && !isOldNamePhone) {
          nameToPersist = existingUser.name;
        }
      }

      // 1. Upsert System User (Authentication/Chat Identity)
      user = await userRepository.upsert({
        where: { email: params.email },
        create: {
          email: params.email,
          name: nameToPersist,
          password: "$2a$10$DummyHashForWhatsAppUser",
          role: params.role || "USER",
          company: { connect: { id: params.companyId } },
          phone: params.phone,
        },
        update: {
          name: nameToPersist,
          ...(params.phone && { phone: params.phone }),
          updatedAt: new Date(),
        },
      });
    } catch (error: unknown) {
      const isUniqueError =
        error instanceof Error &&
        error.message.includes("Unique constraint failed");

      if (isUniqueError) {
        Logger.info(
          `[ChatIdentityService] [SEC] Race condition detected for user ${params.email}, resolving existing...`,
        );
        const existingUserAfterCollision = await userRepository.findFirst({
          where: { email: params.email, companyId: params.companyId },
        });
        if (existingUserAfterCollision) {
          user = existingUserAfterCollision;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // 2. CRM CONTACT SYNC — two guards:
    //    (a) STRICT phone validation: never persist LIDs / internal IDs as contacts.
    //    (b) OPT-IN: auto-import is OFF by default; contacts are created automatically
    //        only when the company enables it. Otherwise the user imports manually.
    const isGroup = params.email.includes("@g.us") ||
                   (params.phone ? !WhatsAppIdUtils.isRealPhoneNumber(params.phone) && params.phone.startsWith("120") : false);

    const hasValidCrmPhone = WhatsAppIdUtils.isValidCrmPhone(params.phone);

    if (user.role === "USER" && !isGroup && hasValidCrmPhone) {
      const autoImport = await companySettingsService.isAutoImportContactsEnabled(params.companyId);
      if (autoImport) {
        try {
          await contactService.upsert(params.companyId, {
            phone: params.phone!,
            name: user.name,
            email: null,
            // Propagate the WhatsApp profile picture from the shadow User so the CRM
            // Contact shows the avatar too (only when present — never overwrite with null).
            ...((user as { profilePicUrl?: string | null }).profilePicUrl
              ? { profilePicUrl: (user as { profilePicUrl?: string | null }).profilePicUrl }
              : {}),
            customFields: {
              source: "whatsapp",
              whatsappId: params.email.split("@")[0],
              userId: user.id,
            },
            tags: ["Imported from Chat"],
          });
          Logger.info(
            `[ChatIdentityService] [OK] CRM Contact auto-synced for real phone: ${params.phone}`,
          );
        } catch (error) {
          Logger.warn(
            `[ChatIdentityService] Failed to sync CRM contact for ${params.email}`,
            { error },
          );
        }
      } else {
        Logger.debug(
          `[ChatIdentityService] [SKIP] Auto-import OFF for ${params.companyId} — not creating contact for ${params.phone}`,
        );
      }
    } else if (isGroup) {
      Logger.debug(`[ChatIdentityService] [SKIP] Group chat, no contact (${params.email})`);
    } else if (!hasValidCrmPhone) {
      Logger.debug(
        `[ChatIdentityService] [SKIP] Not a valid CRM phone (LID/invalid): ${params.phone || "N/A"}`,
      );
    }

    return user;
  }

  /**
   * Update user profile picture
   */
  async updateUserProfilePic(userId: string, companyId: string, url: string) {
    return userRepository.update(userId, companyId, { profilePicUrl: url });
  }

  /**
   * [SEC] 100-YEAR FIX: Find Contact by LID stored in customFields
   */
  async findContactByLid(companyId: string, lid: string) {
    return contactRepository.findFirst({
      where: {
        companyId,
        deletedAt: null,
        customFields: {
          path: ["whatsappLid"],
          equals: lid,
        },
      },
    });
  }

  /**
   * [SEC] 100-YEAR FIX: Save LID -> Phone mapping in Contact's customFields
   */
  async saveLidPhoneMapping(companyId: string, lid: string, phone: string) {
    try {
      const contact = await contactRepository.findFirst({
        where: { companyId, phone, deletedAt: null },
      });

      if (contact) {
        const currentFields =
          (contact.customFields as Prisma.JsonObject) || {};
        await contactRepository.updateByArgs({
          where: { id: contact.id },
          data: {
            customFields: {
              ...currentFields,
              whatsappLid: lid,
            } as Prisma.JsonObject,
          },
        });
        Logger.info(
          `[ChatIdentityService]  LID->Phone mapping saved: ${lid} -> ${phone}`,
        );
      }
    } catch (error) {
      Logger.warn(`[ChatIdentityService] Failed to save LID mapping`, { error });
    }
  }
}

export const chatIdentityService = new ChatIdentityService();
