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

  // 🔄 CHAT SYNC: Store chats and messages for historical sync
  public chats: Map<string, unknown> = new Map();
  public messages: { [jid: string]: unknown[] } = {};

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
    ev.on("messaging-history.set", ({ contacts, messages, chats }) => {
      // Store contacts
      if (contacts) {
        console.info(
          `[Store] 📥 Received history payload with ${contacts.length} contacts`,
        );
        for (const contact of contacts) {
          this.upsertContact(contact);
        }
        console.info(
          `[Store] 📚 History sync processed: Loaded ${contacts.length} contacts`,
        );
      }

      // 🔄 CHAT SYNC: Store chats for later sync
      if (chats) {
        for (const chat of chats) {
          if (chat.id) {
            this.chats.set(chat.id, chat);
          }
        }
        console.info(`[Store] 📚 History sync: Loaded ${chats.length} chats`);
      }

      // 🔄 CHAT SYNC: Store messages for later sync
      // Also extract LID -> Phone mappings from message metadata
      if (messages) {
        for (const msgObj of messages) {
          const msg = msgObj as {
            key?: {
              remoteJid?: string;
              remoteJidAlt?: string;
              senderPn?: string;
              participant?: string;
            };
            message?: unknown;
          };
          if (msg.key?.remoteJid && msg.message) {
            const jid = msg.key.remoteJid;
            if (!this.messages[jid]) {
              this.messages[jid] = [];
            }
            this.messages[jid].push(msg);

            // 🛡️ Extract LID -> Phone mappings from message metadata
            // This is crucial for outbound messages sent from phone
            if (jid.includes("@lid")) {
              const lidBase = jid.split("@")[0].split(":")[0];

              // Check remoteJidAlt (alternative JID with real phone)
              if (
                msg.key.remoteJidAlt &&
                msg.key.remoteJidAlt.includes("@s.whatsapp.net")
              ) {
                this.lidToPhone[lidBase] = msg.key.remoteJidAlt;
                console.info(
                  `[Store] 🎯 LID Mapping from remoteJidAlt: ${lidBase} → ${msg.key.remoteJidAlt}`,
                );
              }

              // Check senderPn (sender phone number)
              if (
                msg.key.senderPn &&
                msg.key.senderPn.includes("@s.whatsapp.net")
              ) {
                this.lidToPhone[lidBase] = msg.key.senderPn;
                console.info(
                  `[Store] 🎯 LID Mapping from senderPn: ${lidBase} → ${msg.key.senderPn}`,
                );
              }
            }
          }
        }
        console.info(
          `[Store] 📚 History sync: Loaded ${messages.length} messages`,
        );
      }
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

    // 🛡️ NEW: Listen for real-time messages to extract LID mappings
    // This catches outbound messages from phone that have LID + phone metadata
    ev.on("messages.upsert", ({ messages: msgs }) => {
      for (const msg of msgs) {
        const key = msg.key as {
          remoteJid?: string;
          remoteJidAlt?: string;
          senderPn?: string;
          participant?: string;
        };

        const jid = key.remoteJid;
        if (!jid || !jid.includes("@lid")) continue;

        const lidBase = jid.split("@")[0].split(":")[0];

        // Extract phone from remoteJidAlt
        if (key.remoteJidAlt && key.remoteJidAlt.includes("@s.whatsapp.net")) {
          if (!this.lidToPhone[lidBase]) {
            this.lidToPhone[lidBase] = key.remoteJidAlt;
            console.info(
              `[Store] 🎯 RT LID Mapping (remoteJidAlt): ${lidBase} → ${key.remoteJidAlt}`,
            );
          }
        }

        // Extract phone from senderPn
        if (key.senderPn && key.senderPn.includes("@s.whatsapp.net")) {
          if (!this.lidToPhone[lidBase]) {
            this.lidToPhone[lidBase] = key.senderPn;
            console.info(
              `[Store] 🎯 RT LID Mapping (senderPn): ${lidBase} → ${key.senderPn}`,
            );
          }
        }

        // Check for phone in message stub parameters (e.g., for system messages)
        if (
          msg.messageStubParameters &&
          Array.isArray(msg.messageStubParameters)
        ) {
          for (const param of msg.messageStubParameters) {
            if (
              typeof param === "string" &&
              param.includes("@s.whatsapp.net") &&
              !param.includes("@lid")
            ) {
              if (!this.lidToPhone[lidBase]) {
                this.lidToPhone[lidBase] = param;
                console.info(
                  `[Store] 🎯 RT LID Mapping (stubParam): ${lidBase} → ${param}`,
                );
              }
              break;
            }
          }
        }
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
