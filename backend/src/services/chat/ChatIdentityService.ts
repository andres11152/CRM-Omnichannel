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

    // [SEC] 100-YEAR FIX (multi-tenant collision): `User.email` is GLOBALLY
    // unique, but shadow emails are phone-derived (`<phone>@whatsapp.user`).
    // When the same customer phone chats with TWO different tenant companies,
    // the second company can never create its shadow user: the RLS guard
    // injects companyId into the upsert's where, the other tenant's row is
    // invisible, Prisma takes the CREATE branch and hits P2002 — forever.
    // Every inbound message from that customer was retried and dropped (DLQ),
    // i.e. "no entran chats". The old catch only re-queried within the same
    // company, so it could never resolve this. Fallback: a company-scoped
    // shadow email (keeps the `@whatsapp.user` suffix every other lookup
    // relies on). Existing single-tenant rows keep their legacy email.
    const [localPart, emailDomain] = params.email.split("@");
    const scopedEmail = `${localPart}.${params.companyId}@${emailDomain}`;

    const findOwnShadowUser = () =>
      userRepository.findFirst({
        where: {
          email: { in: [params.email, scopedEmail] },
          companyId: params.companyId,
        },
      });

    const doUpsert = (email: string) =>
      userRepository.upsert({
        where: { email },
        create: {
          email,
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

    const isUniqueError = (error: unknown): boolean =>
      error instanceof Error &&
      error.message.includes("Unique constraint failed");

    try {
      // 0. Name Preservation (legacy o scoped, siempre dentro de ESTA empresa)
      const existingUser = await findOwnShadowUser();

      if (existingUser) {
        const isNewNamePhone = /^\+?\d[\d\s-]*$/.test(params.name);
        const isOldNamePhone = /^\+?\d[\d\s-]*$/.test(existingUser.name);

        if (isNewNamePhone && !isOldNamePhone) {
          nameToPersist = existingUser.name;
        }
      }

      // 1. Upsert System User — target the email this company already owns
      // (legacy or scoped); default to legacy for brand-new users.
      user = await doUpsert(existingUser?.email ?? params.email);
    } catch (error: unknown) {
      if (!isUniqueError(error)) throw error;

      Logger.info(
        `[ChatIdentityService] [SEC] Email collision for ${params.email} (company ${params.companyId}), resolving...`,
      );

      // (a) True race within this company: the concurrent INSERT from history
      // sync may not be committed yet. Retry the read with growing delays.
      let resolved = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 80 * attempt));
        resolved = await findOwnShadowUser();
        if (resolved) break;
      }

      if (resolved) {
        user = resolved;
      } else {
        // (b) The legacy email belongs to ANOTHER tenant → create this
        // company's own shadow user under the scoped email.
        try {
          user = await doUpsert(scopedEmail);
          Logger.info(
            `[ChatIdentityService] [SEC] Cross-tenant shadow user created as ${scopedEmail}`,
          );
        } catch (scopedError: unknown) {
          if (!isUniqueError(scopedError)) throw scopedError;
          // Race on the scoped email itself — final read.
          const scopedExisting = await findOwnShadowUser();
          if (!scopedExisting) throw scopedError;
          user = scopedExisting;
        }
      }
    }

    // 2. CRM CONTACT SYNC is now strictly manual to avoid database clutter with spam/junk contacts.
    // Shadow users are created for chat participation/identity, but CRM contacts are created
    // only on-demand (via manual import or manual save on chat creation).
    Logger.debug(`[ChatIdentityService] [SKIP] Auto-import of CRM contact disabled for ${params.phone || "N/A"}`);

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
