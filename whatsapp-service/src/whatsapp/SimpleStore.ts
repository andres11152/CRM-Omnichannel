import {
  BaileysEventEmitter,
  Contact,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { Logger } from "../utils/logger";
import redisClient from "../config/redis";

const MAX_MESSAGES_PER_JID = parseInt(
  process.env.WA_STORE_MAX_MESSAGES_PER_JID || "150",
  10,
);
const MAX_TOTAL_CONTACTS = parseInt(
  process.env.WA_STORE_MAX_CONTACTS || "10000",
  10,
);
const MAX_TOTAL_CHATS = parseInt(process.env.WA_STORE_MAX_CHATS || "5000", 10);

export class SimpleInMemoryStore {
  public contacts: { [jid: string]: Contact } = {};
  public chats: Map<string, import("@whiskeysockets/baileys").Chat> = new Map();
  public messages: { [jid: string]: import("@whiskeysockets/baileys").proto.IWebMessageInfo[] } = {};
  public lidToPhone: { [lid: string]: string } = {};
  private backupInterval?: NodeJS.Timeout;

  private upsertContact(contact: Partial<Contact>) {
    if (!contact.id) return;
    const jid = jidNormalizedUser(contact.id);

    const contactKeys = Object.keys(this.contacts);
    if (contactKeys.length >= MAX_TOTAL_CONTACTS && !this.contacts[jid]) {
      const evictCount = Math.floor(MAX_TOTAL_CONTACTS * 0.1);
      const toEvict = contactKeys.slice(0, evictCount);
      for (const key of toEvict) {
        delete this.contacts[key];
      }
      Logger.debug(
        `[Store] Pruned ${evictCount} contacts (cap: ${MAX_TOTAL_CONTACTS})`,
      );
    }

    this.contacts[jid] = {
      ...(this.contacts[jid] || {}),
      ...contact,
      id: jid,
    };

    if (contact.lid) {
      const lid = jidNormalizedUser(contact.lid);
      this.contacts[jid].lid = lid;
      const lidBase = lid.split("@")[0].split(":")[0];
      this.lidToPhone[lidBase] = jid;
    }

    const contactWithPhone = contact as Contact & { phoneNumber?: string };
    if (contactWithPhone.phoneNumber) {
      const lidBase = jid.split("@")[0].split(":")[0];
      const phoneJid = `${contactWithPhone.phoneNumber}@s.whatsapp.net`;
      this.lidToPhone[lidBase] = phoneJid;
    }
  }

  private appendMessage(jid: string, msg: import("@whiskeysockets/baileys").proto.IWebMessageInfo): void {
    if (!this.messages[jid]) {
      this.messages[jid] = [];
    }

    this.messages[jid].push(msg);
    if (this.messages[jid].length > MAX_MESSAGES_PER_JID) {
      const getTs = (obj: unknown): number => {
        const msgObj = obj as { messageTimestamp?: unknown };
        const ts = msgObj.messageTimestamp;
        if (typeof ts === "number") return ts;
        if (!ts) return 0;
        if (typeof ts === "string") return Number(ts);
        if (typeof ts === "object") {
          const tsObj = ts as { toNumber?: () => number; low?: number };
          if (typeof tsObj.toNumber === "function") return tsObj.toNumber();
          if (typeof tsObj.low === "number") return tsObj.low;
        }
        return Number(ts);
      };

      this.messages[jid].sort((a, b) => {
        return getTs(a) - getTs(b);
      });
      const excess = this.messages[jid].length - MAX_MESSAGES_PER_JID;
      this.messages[jid].splice(0, excess);
    }
  }

  public bind(ev: BaileysEventEmitter) {
    ev.on("messaging-history.set", ({ contacts, messages, chats }) => {
      if (contacts) {
        for (const contact of contacts) this.upsertContact(contact);
      }
      if (chats) {
        for (const chat of chats) {
          if (chat.id) {
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
      }
      if (messages) {
        for (const msgObj of messages) {
          const msg = msgObj as import("@whiskeysockets/baileys").proto.IWebMessageInfo & {
            key: { remoteJidAlt?: string; senderPn?: string };
          };
          if (msg.key?.remoteJid && msg.message) {
            const jid = msg.key.remoteJid;
            this.appendMessage(jid, msg as import("@whiskeysockets/baileys").proto.IWebMessageInfo);
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
      }
    });

    ev.on("contacts.upsert", (contacts: Contact[]) => {
      for (const contact of contacts) this.upsertContact(contact);
    });

    ev.on("contacts.update", (updates: Partial<Contact>[]) => {
      for (const update of updates) this.upsertContact(update);
    });

    ev.on("messages.upsert", ({ messages: msgs }) => {
      for (const msg of msgs) {
        const key = msg.key as typeof msg.key & {
          remoteJidAlt?: string;
          participantAlt?: string;
        };
        const jid = key.remoteJid;

        if (jid && msg.message) {
          this.appendMessage(jid, msg);
        }

        const capture = (a?: string | null, b?: string) => {
          if (!a || !b) return;
          if (a.includes("@lid") && b.includes("@s.whatsapp.net")) {
            this.lidToPhone[a.split("@")[0].split(":")[0]] = b;
          } else if (b.includes("@lid") && a.includes("@s.whatsapp.net")) {
            this.lidToPhone[b.split("@")[0].split(":")[0]] = a;
          }
        };
        capture(jid, key.remoteJidAlt);
        capture(key.participant, key.participantAlt);

        if (jid && jid.includes("@lid") && Array.isArray(msg.messageStubParameters)) {
          const lidBase = jid.split("@")[0].split(":")[0];
          for (const param of msg.messageStubParameters) {
            if (
              typeof param === "string" &&
              param.includes("@s.whatsapp.net") &&
              !param.includes("@lid")
            ) {
              if (!this.lidToPhone[lidBase]) this.lidToPhone[lidBase] = param;
              break;
            }
          }
        }
      }
    });

    (
      ev as unknown as {
        on: (event: string, cb: (data: unknown) => void) => void;
      }
    ).on("lid-mapping.update", (data: unknown) => {
      const list = Array.isArray(data) ? data : data ? [data] : [];
      for (const raw of list) {
        const m = raw as { pn?: string; lid?: string; number?: string };
        const lid = m.lid;
        const pn = m.pn || (m.number ? `${m.number}@s.whatsapp.net` : undefined);
        if (!lid || !pn) continue;
        const lidBase = lid.split("@")[0].split(":")[0];
        const phoneJid = pn.includes("@") ? pn : `${pn}@s.whatsapp.net`;
        if (lidBase && phoneJid.includes("@s.whatsapp.net")) {
          this.lidToPhone[lidBase] = phoneJid;
        }
      }
    });
  }

  public getPhoneFromLid(lid: string): string | undefined {
    const lidBase = lid.split("@")[0].split(":")[0];
    return this.lidToPhone[lidBase];
  }

  public getStats() {
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

  public flush(): void {
    const lidMappingsBackup = { ...this.lidToPhone };
    this.messages = {};
    this.chats.clear();
    this.lidToPhone = lidMappingsBackup;
    Logger.warn(
      "[Store] FLUSH: Cleared messages & chats (LID mappings preserved).",
    );
  }

  public async writeToRedis(redisKey: string): Promise<void> {
    if (!redisClient?.isOpen) return;

    const data = {
      contacts: this.contacts,
      chats: Array.from(this.chats.entries()),
      lidToPhone: this.lidToPhone,
    };

    try {
      await redisClient.set(`wa:store:${redisKey}`, JSON.stringify(data), {
        EX: 7 * 24 * 60 * 60,
      });
      Logger.debug(
        `[Store] Wrote memory store to Redis (Key: wa:store:${redisKey})`,
      );
    } catch (e) {
      Logger.error(e, `[Store] [ERROR] Failed to write store to Redis`);
    }
  }

  public async readFromRedis(redisKey: string): Promise<void> {
    if (!redisClient?.isOpen) return;

    try {
      const dataStr = await Promise.race([
        redisClient.get(`wa:store:${redisKey}`),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (dataStr) {
        const data = JSON.parse(dataStr as string);
        this.contacts = data.contacts || {};
        this.chats = new Map(data.chats || []);
        this.lidToPhone = data.lidToPhone || {};
        Logger.info(
          `[Store] Loaded memory store from Redis (Key: wa:store:${redisKey})`,
        );
      }
    } catch (e) {
      Logger.error(e, `[Store] [ERROR] Failed to read store from Redis`);
    }
  }

  public async enablePersistence(
    redisKey: string,
    writeIntervalMs = 60000,
  ): Promise<void> {
    await this.readFromRedis(redisKey);
    if (this.backupInterval) clearInterval(this.backupInterval);
    this.backupInterval = setInterval(
      () => this.writeToRedis(redisKey),
      writeIntervalMs,
    );
    Logger.info(
      `[Store] Redis Persistence enabled with interval ${writeIntervalMs}ms`,
    );
  }

  public disablePersistence(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = undefined;
      Logger.info("[Store] Redis Persistence disabled.");
    }
  }
}
