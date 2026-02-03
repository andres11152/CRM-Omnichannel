import {
  BaileysEventEmitter,
  Contact,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";

/**
 * 🛡️ 100-YEAR FIX: Custom In-Memory Store
 * Lightweight implementation focused on LID -> Phone mapping.
 * Listens to all relevant events including history sync and LID mappings.
 */
export class SimpleInMemoryStore {
  public contacts: { [jid: string]: Contact } = {};

  // 🛡️ Reverse mapping: LID -> Phone for quick lookups
  public lidToPhone: { [lid: string]: string } = {};

  /**
   * Internal helper to normalize and store contacts
   */
  private upsertContact(contact: Partial<Contact>) {
    if (!contact.id) return;
    const jid = jidNormalizedUser(contact.id);

    this.contacts[jid] = {
      ...(this.contacts[jid] || {}),
      ...contact,
      id: jid, // Ensure normalized ID as key and property
    };

    // 🛡️ Capture LID mapping if present
    if (contact.lid) {
      const lid = jidNormalizedUser(contact.lid);
      this.contacts[jid].lid = lid;
      const lidBase = lid.split("@")[0].split(":")[0];
      this.lidToPhone[lidBase] = jid;
      Logger.info(`[Store] 🔗 LID Mapping: ${lidBase} → ${jid}`);
    }

    // 🛡️ If this is a LID contact with phoneNumber field, create reverse mapping
    const contactWithPhone = contact as Contact & { phoneNumber?: string };
    if (contactWithPhone.phoneNumber) {
      const lidBase = jid.split("@")[0].split(":")[0];
      const phoneJid = `${contactWithPhone.phoneNumber}@s.whatsapp.net`;
      this.lidToPhone[lidBase] = phoneJid;
      console.info(
        `[Store] 🎯 Phone Discovery: LID ${lidBase} → Phone ${contactWithPhone.phoneNumber}`,
      );
    }
  }

  public bind(ev: BaileysEventEmitter) {
    // 1. Bulk History Sync (The most important for LID resolution)
    ev.on("messaging-history.set", ({ contacts }) => {
      if (!contacts) return;
      console.info(
        `[Store] 📥 Received history payload with ${contacts.length} contacts`,
      );
      for (const contact of contacts) {
        this.upsertContact(contact);
      }
      console.info(
        `[Store] 📚 History sync processed: Loaded ${contacts.length} contacts`,
      );
    });

    // 2. New Contacts
    ev.on("contacts.upsert", (contacts: Contact[]) => {
      console.info(
        `[Store] 📥 contacts.upsert received ${contacts.length} contacts`,
      );
      for (const contact of contacts) {
        this.upsertContact(contact);
      }
    });

    // 3. Contact Updates
    ev.on("contacts.update", (updates: Partial<Contact>[]) => {
      for (const update of updates) {
        this.upsertContact(update);
      }
    });

    // 4. 🛡️ EXPERIMENTAL: LID Mapping Updates (Baileys experimental feature)
    // This event may not exist in all Baileys versions
    (
      ev as unknown as {
        on: (event: string, cb: (data: unknown) => void) => void;
      }
    ).on("lid-mapping.update", (data: unknown) => {
      const mappings = data as
        | Array<{ lid: string; number: string }>
        | undefined;
      if (!mappings) return;
      console.info(`[Store] 🆕 LID Mapping Update event received!`);
      for (const mapping of mappings) {
        if (mapping.lid && mapping.number) {
          const lidBase = mapping.lid.split("@")[0].split(":")[0];
          const phoneJid = `${mapping.number}@s.whatsapp.net`;
          this.lidToPhone[lidBase] = phoneJid;
          console.info(
            `[Store] 🎯 LID Mapping: ${lidBase} → ${mapping.number}`,
          );
        }
      }
    });
  }

  /**
   * 🛡️ Quick lookup: Get phone JID from LID
   */
  public getPhoneFromLid(lid: string): string | undefined {
    const lidBase = lid.split("@")[0].split(":")[0];
    return this.lidToPhone[lidBase];
  }
}
