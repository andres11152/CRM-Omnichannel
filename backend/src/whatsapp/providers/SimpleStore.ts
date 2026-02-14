import {
  BaileysEventEmitter,
  Contact,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { Logger } from "@/utils/logger";

/**
 * 🛡️ MEMORY-OPTIMIZED IN-MEMORY STORE
 *
 * Lightweight implementation focused on LID -> Phone mapping.
 *
 * 🔧 MEMORY OPTIMIZATION (10 tenants / 4GB):
 * - Messages capped at MAX_MESSAGES_PER_JID per chat.
 * - Total contacts cap at MAX_CONTACTS.
 * - Auto-pruning clears oldest entries when limits are reached.
 * - Configurable via environment variables.
 */

/** Memory budget configuration */
const MAX_MESSAGES_PER_JID = parseInt(
  process.env.WA_STORE_MAX_MESSAGES_PER_JID || "100",
  10,
);
const MAX_TOTAL_CONTACTS = parseInt(
  process.env.WA_STORE_MAX_CONTACTS || "10000",
  10,
);
const MAX_TOTAL_CHATS = parseInt(process.env.WA_STORE_MAX_CHATS || "5000", 10);

export class SimpleInMemoryStore {
  public contacts: { [jid: string]: Contact } = {};
  public chats: Map<string, unknown> = new Map();
  public messages: { [jid: string]: unknown[] } = {};
  public lidToPhone: { [lid: string]: string } = {};

  // ────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ────────────────────────────────────────────────

  private upsertContact(contact: Partial<Contact>) {
    if (!contact.id) return;
    const jid = jidNormalizedUser(contact.id);

    // Prune contacts if we hit the cap
    const contactKeys = Object.keys(this.contacts);
    if (contactKeys.length >= MAX_TOTAL_CONTACTS && !this.contacts[jid]) {
      // Evict the oldest 10% to avoid constant pruning
      const evictCount = Math.floor(MAX_TOTAL_CONTACTS * 0.1);
      const toEvict = contactKeys.slice(0, evictCount);
      for (const key of toEvict) {
        delete this.contacts[key];
      }
      Logger.debug(
        `[Store] 🧹 Pruned ${evictCount} contacts (cap: ${MAX_TOTAL_CONTACTS})`,
      );
    }

    this.contacts[jid] = {
      ...(this.contacts[jid] || {}),
      ...contact,
      id: jid,
    };

    // Capture LID mapping
    if (contact.lid) {
      const lid = jidNormalizedUser(contact.lid);
      this.contacts[jid].lid = lid;
      const lidBase = lid.split("@")[0].split(":")[0];
      this.lidToPhone[lidBase] = jid;
    }

    // If LID contact with phoneNumber, build reverse mapping
    const contactWithPhone = contact as Contact & { phoneNumber?: string };
    if (contactWithPhone.phoneNumber) {
      const lidBase = jid.split("@")[0].split(":")[0];
      const phoneJid = `${contactWithPhone.phoneNumber}@s.whatsapp.net`;
      this.lidToPhone[lidBase] = phoneJid;
    }
  }

  /**
   * Append a message to a JID's message array with cap enforcement.
   */
  private appendMessage(jid: string, msg: unknown): void {
    if (!this.messages[jid]) {
      this.messages[jid] = [];
    }

    this.messages[jid].push(msg);

    // Prune to cap (keep newest messages)
    if (this.messages[jid].length > MAX_MESSAGES_PER_JID) {
      const excess = this.messages[jid].length - MAX_MESSAGES_PER_JID;
      this.messages[jid].splice(0, excess);
    }
  }

  // ────────────────────────────────────────────────
  // EVENT BINDING
  // ────────────────────────────────────────────────

  public bind(ev: BaileysEventEmitter) {
    // 1. History Sync (bulk load)
    ev.on("messaging-history.set", ({ contacts, messages, chats }) => {
      if (contacts) {
        Logger.info(`[Store] 📥 History sync: ${contacts.length} contacts`);
        for (const contact of contacts) {
          this.upsertContact(contact);
        }
      }

      if (chats) {
        for (const chat of chats) {
          if (chat.id) {
            // Prune chats if cap reached
            if (
              this.chats.size >= MAX_TOTAL_CHATS &&
              !this.chats.has(chat.id)
            ) {
              const firstKey = this.chats.keys().next().value;
              if (firstKey) this.chats.delete(firstKey);
            }
            this.chats.set(chat.id, chat);
          }
        }
        Logger.info(
          `[Store] 📚 History sync: ${chats.length} chats (cap: ${MAX_TOTAL_CHATS})`,
        );
      }

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
            this.appendMessage(jid, msg);

            // Extract LID -> Phone from message metadata
            if (jid.includes("@lid")) {
              const lidBase = jid.split("@")[0].split(":")[0];
              if (
                msg.key.remoteJidAlt &&
                msg.key.remoteJidAlt.includes("@s.whatsapp.net")
              ) {
                this.lidToPhone[lidBase] = msg.key.remoteJidAlt;
              }
              if (
                msg.key.senderPn &&
                msg.key.senderPn.includes("@s.whatsapp.net")
              ) {
                this.lidToPhone[lidBase] = msg.key.senderPn;
              }
            }
          }
        }
        Logger.info(
          `[Store] 📚 History sync: ${messages.length} messages (cap per JID: ${MAX_MESSAGES_PER_JID})`,
        );
      }
    });

    // 2. New Contacts
    ev.on("contacts.upsert", (contacts: Contact[]) => {
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

    // 4. Real-time messages -> extract LID mappings
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

        if (key.remoteJidAlt && key.remoteJidAlt.includes("@s.whatsapp.net")) {
          if (!this.lidToPhone[lidBase]) {
            this.lidToPhone[lidBase] = key.remoteJidAlt;
          }
        }

        if (key.senderPn && key.senderPn.includes("@s.whatsapp.net")) {
          if (!this.lidToPhone[lidBase]) {
            this.lidToPhone[lidBase] = key.senderPn;
          }
        }

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
              }
              break;
            }
          }
        }
      }
    });

    // 5. Experimental LID Mapping Updates
    (
      ev as unknown as {
        on: (event: string, cb: (data: unknown) => void) => void;
      }
    ).on("lid-mapping.update", (data: unknown) => {
      const mappings = data as
        | Array<{ lid: string; number: string }>
        | undefined;
      if (!mappings) return;
      for (const mapping of mappings) {
        if (mapping.lid && mapping.number) {
          const lidBase = mapping.lid.split("@")[0].split(":")[0];
          const phoneJid = `${mapping.number}@s.whatsapp.net`;
          this.lidToPhone[lidBase] = phoneJid;
        }
      }
    });
  }

  // ────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────

  public getPhoneFromLid(lid: string): string | undefined {
    const lidBase = lid.split("@")[0].split(":")[0];
    return this.lidToPhone[lidBase];
  }

  /**
   * 📊 Memory usage stats (useful for monitoring endpoint)
   */
  public getStats(): {
    contacts: number;
    chats: number;
    messageJids: number;
    totalMessages: number;
    lidMappings: number;
  } {
    const totalMessages = Object.values(this.messages).reduce(
      (acc, arr) => acc + arr.length,
      0,
    );
    return {
      contacts: Object.keys(this.contacts).length,
      chats: this.chats.size,
      messageJids: Object.keys(this.messages).length,
      totalMessages,
      lidMappings: Object.keys(this.lidToPhone).length,
    };
  }

  /**
   * 🧹 MANUAL FLUSH: Clear all non-essential data.
   * Keeps only LID mappings. Called when memory is critical.
   */
  public flush(): void {
    const lidMappingsBackup = { ...this.lidToPhone };
    this.messages = {};
    this.chats.clear();
    this.lidToPhone = lidMappingsBackup;
    Logger.warn(
      "[Store] 🧹 FLUSH: Cleared messages & chats (LID mappings preserved).",
    );
  }
}
