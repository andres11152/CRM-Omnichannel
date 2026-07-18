import { WASocket, Contact, jidNormalizedUser } from "@whiskeysockets/baileys";
import { SimpleInMemoryStore } from "./SimpleStore";
import { sessionModuleLogger as logger } from "./SessionLogger";

interface ExtendedWASocket extends WASocket {
  getLidToPhoneNumberMap?: (lids: string[]) => Promise<{ [lid: string]: string }>;
}

export class SessionContactResolver {
  private circuitBreakers: Map<string, { consecutiveFailures: number; circuitOpenedUntil: number }> = new Map();

  constructor(
    private sessions: Map<string, WASocket>,
    private sessionStores: Map<string, SimpleInMemoryStore>,
    private sessionMetadata: Map<string, { companyId: string; status: string }>,
  ) {}

  private getStore(sessionId: string): SimpleInMemoryStore | undefined {
    const meta = this.sessionMetadata.get(sessionId);
    if (meta) {
      const compositeKey = `${meta.companyId}::${sessionId}`;
      const storeByComposite = this.sessionStores.get(compositeKey);
      if (storeByComposite) return storeByComposite;
    }
    return this.sessionStores.get(sessionId);
  }

  public getContactInfo(sessionId: string, jid: string): Contact | undefined {
    const store = this.getStore(sessionId);
    if (!store) return undefined;
    return store.contacts[jidNormalizedUser(jid)];
  }

  public findContactByLid(sessionId: string, lid: string): Contact | undefined {
    const store = this.getStore(sessionId);
    if (!store) return undefined;

    const lidBase = lid.split("@")[0].split(":")[0];
    if (!lidBase || lidBase.length < 10) return undefined;

    const cachedPhone = store.getPhoneFromLid(lidBase);
    if (cachedPhone && !cachedPhone.includes(lidBase)) {
      logger.info(
        `[SessionContactResolver] Cache hit: LID ${lidBase} → ${cachedPhone}`,
      );
      return { id: cachedPhone };
    }

    const contacts = store.contacts;
    for (const jid in contacts) {
      const contact = contacts[jid];
      if (!contact.lid) continue;
      const storedLidBase = contact.lid.split("@")[0].split(":")[0];
      if (lidBase === storedLidBase) {
        logger.info(`[SessionContactResolver] LID ${lidBase} → Phone ${jid}`);
        return contact;
      }
    }

    logger.debug(`[SessionContactResolver] LID Resolution Failed: ${lidBase}`);
    return undefined;
  }

  public async resolveLidToPhone(
    sessionId: string,
    lid: string,
  ): Promise<string | null> {
    const sock = this.sessions.get(sessionId) as ExtendedWASocket;
    if (!sock) return null;

    if (lid.includes("@g.us") || lid.includes("@s.whatsapp.net")) return null;

    const fromStore = this.findContactByLid(sessionId, lid);
    if (fromStore?.id && !fromStore.id.includes("@lid")) {
      return fromStore.id.split("@")[0].split(":")[0];
    }

    try {
      const lidMapping = (sock as unknown as {
        signalRepository?: { lidMapping?: { getPNForLID?: (l: string) => Promise<string | null> } };
      }).signalRepository?.lidMapping;
      if (lidMapping?.getPNForLID) {
        const fullLid = lid.includes("@lid") ? lid : `${lid}@lid`;
        const pnJid = await lidMapping.getPNForLID(fullLid);
        if (pnJid && pnJid.includes("@s.whatsapp.net")) {
          const phone = pnJid.split("@")[0].split(":")[0];
          logger.info(`[SessionContactResolver] [LID-STORE] ${fullLid} → ${pnJid}`);
          const store = this.getStore(sessionId);
          if (store) store.lidToPhone[lid.split("@")[0].split(":")[0]] = pnJid;
          return phone;
        }
      }
    } catch (err) {
      logger.debug(`[SessionContactResolver] lidMapping.getPNForLID failed for ${lid}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const cb = this.circuitBreakers.get(sessionId) || { consecutiveFailures: 0, circuitOpenedUntil: 0 };
    const now = Date.now();

    if (cb.circuitOpenedUntil > now) {
      logger.warn(
        `[SessionContactResolver] [CircuitBreaker] Circuit is OPEN for session ${sessionId}. Bypassing active LID query for ${lid}.`,
      );
      return null;
    }

    let queryFailed = false;
    try {
      const fullLid = lid.includes("@lid") ? lid : `${lid}@lid`;
      await Promise.race([
        sock.onWhatsApp(fullLid),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("LID resolution timeout after 5s")), 5000),
        ),
      ]);

      if (cb.consecutiveFailures > 0) {
        cb.consecutiveFailures = 0;
        this.circuitBreakers.set(sessionId, cb);
      }
    } catch (err) {
      queryFailed = true;
      cb.consecutiveFailures += 1;
      
      if (cb.consecutiveFailures >= 3) {
        cb.circuitOpenedUntil = now + 5 * 60 * 1000;
        logger.error(
          `[SessionContactResolver] [CircuitBreaker] [CRITICAL] 3 consecutive failures for session ${sessionId}. Opening circuit for 5 minutes.`,
        );
      }
      this.circuitBreakers.set(sessionId, cb);
    }

    if (!queryFailed) {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const resolved = this.findContactByLid(sessionId, lid);
        if (resolved?.id && !resolved.id.includes("@lid")) {
          return resolved.id.split("@")[0].split(":")[0];
        }
      }
    }

    return null;
  }

  public async resolveLidsToPhones(
    sessionId: string,
    lids: string[],
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    await Promise.all(
      lids.map(async (lid) => {
        const phone = await this.resolveLidToPhone(sessionId, lid);
        if (phone) results[lid] = phone;
      }),
    );
    return results;
  }
}
