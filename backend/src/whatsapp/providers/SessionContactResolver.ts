import { WASocket, Contact, jidNormalizedUser } from "@whiskeysockets/baileys";
import { SimpleInMemoryStore } from "./SimpleStore";
import { sessionModuleLogger as logger } from "./SessionLogger";

interface ExtendedWASocket extends WASocket {
  getLidToPhoneNumberMap?: (lids: string[]) => Promise<{ [lid: string]: string }>;
}

/**
 * [BUILD] SESSION CONTACT RESOLVER (SRP Refactored)
 *
 * Responsabilidad Única: Resolver contactos e identidades (JIDs/LIDs) asociadas a una sesión
 * de WhatsApp activa. Mapea identificadores LID a números de teléfono reales utilizando
 * búsquedas locales en memoria y consultas directas en caliente a los servidores de WhatsApp.
 */
export class SessionContactResolver {
  // Circuit Breaker: sessionId -> { consecutiveFailures: number, circuitOpenedUntil: number }
  private circuitBreakers: Map<string, { consecutiveFailures: number; circuitOpenedUntil: number }> = new Map();

  constructor(
    private sessions: Map<string, WASocket>,
    private sessionStores: Map<string, SimpleInMemoryStore>
  ) {}

  /**
   * Obtiene la información de un contacto directamente de la memoria local (store) de la sesión.
   */
  public getContactInfo(sessionId: string, jid: string): Contact | undefined {
    const store = this.sessionStores.get(sessionId);
    if (!store) return undefined;
    return store.contacts[jidNormalizedUser(jid)];
  }

  /**
   * Busca un contacto en memoria a partir de su LID (LID -> Contacto).
   */
  public findContactByLid(sessionId: string, lid: string): Contact | undefined {
    const store = this.sessionStores.get(sessionId);
    if (!store) return undefined;

    const lidBase = lid.split("@")[0].split(":")[0];
    if (!lidBase || lidBase.length < 10) return undefined;

    // Búsqueda rápida en caché de mapeos LID -> Teléfono
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

  /**
   * Resuelve el número de teléfono real a partir de un LID, consultando el
   * store y ejecutando un polling adaptativo con consulta en vivo si es necesario.
   * Cuenta con protección de Circuit Breaker para caídas en caliente de la API de WhatsApp.
   */
  public async resolveLidToPhone(
    sessionId: string,
    lid: string,
  ): Promise<string | null> {
    const sock = this.sessions.get(sessionId) as ExtendedWASocket;
    if (!sock) return null;

    // [SEC] GUARDIA: Nunca intentar resolver JIDs de grupo o JIDs normales como LIDs
    if (lid.includes("@g.us") || lid.includes("@s.whatsapp.net")) return null;

    // 1. Comprobación inmediata en el store
    const fromStore = this.findContactByLid(sessionId, lid);
    if (fromStore?.id && !fromStore.id.includes("@lid")) {
      return fromStore.id.split("@")[0].split(":")[0];
    }

    // 2. Comprobación del estado del Circuit Breaker
    const cb = this.circuitBreakers.get(sessionId) || { consecutiveFailures: 0, circuitOpenedUntil: 0 };
    const now = Date.now();

    if (cb.circuitOpenedUntil > now) {
      logger.warn(
        `[SessionContactResolver] [CircuitBreaker] Circuit is OPEN for session ${sessionId} due to consecutive network failures. Bypassing active LID query for ${lid}.`,
      );
      return null; // Caída inmediata al fallback offline
    }

    // 3. Consulta segura para forzar la resolución de LID sin corromper el stream
    let queryFailed = false;
    try {
      const fullLid = lid.includes("@lid") ? lid : `${lid}@lid`;
      await sock.onWhatsApp(fullLid);
      
      // Si la petición es exitosa, reseteamos fallos del Circuit Breaker
      if (cb.consecutiveFailures > 0) {
        cb.consecutiveFailures = 0;
        this.circuitBreakers.set(sessionId, cb);
      }
    } catch (err) {
      queryFailed = true;
      cb.consecutiveFailures += 1;
      
      if (cb.consecutiveFailures >= 3) {
        cb.circuitOpenedUntil = now + 5 * 60 * 1000; // Abrir circuito por 5 minutos
        logger.error(
          `[SessionContactResolver] [CircuitBreaker] [CRITICAL] 3 consecutive failures to connect with WhatsApp servers for session ${sessionId}. Opening circuit for 5 minutes.`,
        );
      }
      this.circuitBreakers.set(sessionId, cb);
    }

    // 4. Polling adaptativo en el store local esperando la actualización asíncrona (solo si la consulta no falló)
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

  /**
   * Resuelve múltiples LIDs a números de teléfono reales en paralelo.
   */
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
