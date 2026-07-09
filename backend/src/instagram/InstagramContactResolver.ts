import { Contact } from "@prisma/client";
import { contactRepository } from "@/repositories/ContactRepository";
import { Logger } from "@/utils/logger";

export interface InstagramContactResolverParams {
  companyId: string;
  igsid: string;
  name?: string;
  username?: string;
}

/**
 * INSTAGRAM CONTACT RESOLVER
 *
 * Single Responsibility: find-or-create a Contact for an Instagram DM sender,
 * keyed by their Instagram-Scoped ID (IGSID) rather than a phone number.
 *
 * Deliberately does NOT reuse ContactResolver.ts: that resolver's "+prefix"
 * normalization and LID-merge logic are exclusively meaningful for WhatsApp
 * phone numbers/JIDs and don't apply to Instagram identifiers.
 */
export class InstagramContactResolver {
  async resolve(params: InstagramContactResolverParams): Promise<Contact> {
    const { companyId, igsid, name, username } = params;

    Logger.debug(`[InstagramContactResolver] Resolving contact for IGSID: ${igsid}`);

    return contactRepository.upsert({
      where: { companyId_instagramUserId: { companyId, instagramUserId: igsid } },
      update: {
        ...(name && { name }),
        ...(username && { instagramUsername: username }),
      },
      create: {
        companyId,
        instagramUserId: igsid,
        instagramUsername: username,
        name: name || username || `Instagram User ${igsid}`,
        tags: ["INSTAGRAM_LEAD"],
      },
    });
  }
}

export const instagramContactResolver = new InstagramContactResolver();
