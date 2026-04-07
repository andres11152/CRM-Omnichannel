import { Contact, Prisma } from "@prisma/client";
import { contactRepository } from "@/repositories/ContactRepository";
import { Logger } from "@/utils/logger";
import type { IdentityResult } from "@/utils/contactStrategy";

/**
 * [SEC] TYPE GUARD
 */
function isPrismaError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "clientVersion" in error
  );
}

export interface ContactResolverParams {
  companyId: string;
  phone: string;
  identity: IdentityResult;
  isOutbound: boolean;
  originalLid?: string;
}

/**
 *  CONTACT RESOLVER
 *
 * Single Responsibility: Resolves or creates a Contact record for an incoming/outgoing message.
 * Handles phone normalization, LID migration, zombie recovery, and race conditions.
 */
export class ContactResolver {
  /**
   * Resolves a contact for the given phone/company combination.
   * Creates if not found. Handles LID merges and zombie recovery.
   */
  async resolve(params: ContactResolverParams): Promise<Contact> {
    const { companyId, phone, identity, isOutbound, originalLid } = params;

    // 1. FIND EXISTING CONTACT (flexible search for "+" prefix variants)
    let contact = await this.findExisting(companyId, phone);

    if (contact) {
      // Normalize phone if stored with "+"
      contact = await this.normalizePhoneIfNeeded(contact, phone);

      // Update name if we have a better one
      contact = await this.upgradeNameIfNeeded(
        contact,
        phone,
        identity,
        isOutbound,
      );
    } else {
      // 2. MERGE STRATEGY: Check for legacy LID contact
      contact = await this.tryMergeLidContact(
        companyId,
        phone,
        identity,
        originalLid,
      );

      if (!contact) {
        // 3. CREATE NEW (with race condition handling + zombie recovery)
        contact = await this.createOrRecover(companyId, phone, identity);
      }
    }

    // 4. PERSIST LID MAPPING
    if (originalLid) {
      await this.persistLidMapping(contact, originalLid);
    }

    return contact;
  }

  // ─── Private Helpers ───────────────────────────────────────────

  private async findExisting(
    companyId: string,
    phone: string,
  ): Promise<Contact | null> {
    return contactRepository.findFirst({
      where: {
        companyId,
        phone: { in: [phone, `+${phone}`] },
      },
    });
  }

  private async normalizePhoneIfNeeded(
    contact: Contact,
    phone: string,
  ): Promise<Contact> {
    if (contact.phone !== phone) {
      Logger.info(
        `[ContactResolver]  Normalizing phone (removing +): ${contact.phone} -> ${phone}`,
      );
      return contactRepository.update(contact.companyId, contact.id, { phone });
    }
    return contact;
  }

  private async upgradeNameIfNeeded(
    contact: Contact,
    phone: string,
    identity: IdentityResult,
    isOutbound: boolean,
  ): Promise<Contact> {
    if (identity.contactName && !isOutbound) {
      const currentNameIsPhone = contact.name === phone || !contact.name;
      if (currentNameIsPhone && contact.name !== identity.contactName) {
        Logger.info(
          `[ContactResolver] ️ Upgrading name: ${identity.contactName}`,
        );
        return contactRepository.update(contact.companyId, contact.id, {
          name: identity.contactName,
        });
      }
    }
    return contact;
  }

  private async tryMergeLidContact(
    companyId: string,
    phone: string,
    identity: IdentityResult,
    originalLid?: string,
  ): Promise<Contact | null> {
    if (!originalLid) return null;

    const legacyContact = await contactRepository.findFirst({
      where: { companyId, phone: originalLid },
    });

    if (!legacyContact) return null;

    Logger.info(
      `[ContactResolver] [SYNC] Merging legacy LID: ${originalLid} -> ${phone}`,
    );

    return contactRepository.update(companyId, legacyContact.id, {
      phone,
      ...(identity.contactName && { name: identity.contactName }),
    });
  }

  private async createOrRecover(
    companyId: string,
    phone: string,
    identity: IdentityResult,
  ): Promise<Contact> {
    Logger.info(
      `[ContactResolver]  Creating contact: ${identity.subjectDisplayName}`,
    );

    try {
      return await contactRepository.create(
        companyId,
        phone,
        identity.contactName,
      );
    } catch (error: unknown) {
      if (isPrismaError(error) && error.code === "P2002") {
        return this.recoverFromRaceCondition(companyId, phone, identity, error);
      }
      throw error;
    }
  }

  private async recoverFromRaceCondition(
    companyId: string,
    phone: string,
    identity: IdentityResult,
    originalError: unknown,
  ): Promise<Contact> {
    Logger.info(`[ContactResolver] ️ Race condition on create. Recovering...`);

    // Check even soft-deleted contacts
    const contact = await contactRepository.findFirst({
      where: { companyId, phone },
      // @ts-expect-error: Custom middleware param (SafeDeleteMiddleware)
      includeDeleted: true,
    });

    if (!contact) {
      Logger.error(
        `[ContactResolver] [ERROR] PHANTOM: P2002 but findFirst(includeDeleted) returned NULL.`,
      );
      throw originalError;
    }

    const isZombie = !!contact.deletedAt;
    if (isZombie) {
      Logger.info(
        `[ContactResolver]  Restoring zombie contact: ${phone} (ID: ${contact.id})`,
      );
    }

    await contactRepository.update(companyId, contact.id, {
      deletedAt: null,
      name: identity.contactName || contact.name,
      phone,
    });

    contact.deletedAt = null;
    if (identity.contactName) contact.name = identity.contactName;

    return contact;
  }

  private async persistLidMapping(
    contact: Contact,
    originalLid: string,
  ): Promise<void> {
    const currentFields =
      (contact.customFields as Record<string, unknown>) || {};
    if (currentFields.lid !== originalLid) {
      Logger.info(`[ContactResolver] [SAVE] Persisting LID mapping`);
      await contactRepository
        .update(contact.companyId, contact.id, {
          customFields: { ...currentFields, lid: originalLid },
        })
        .catch((e) => Logger.warn("LID map save failed", { error: e }));
    }
  }
}

export const contactResolver = new ContactResolver();
