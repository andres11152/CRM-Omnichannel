import { ISessionManager } from "../core/interfaces/ISessionManager";
import { WhatsAppSessionRepository } from "@/repositories/WhatsAppSessionRepository";
import { AppError } from "@/utils/AppError";
import { Prisma } from "@prisma/client";

// [SEC] The methods that used to live here (initialize/createSession/
// requestPairingCode/deleteSession/reconnectSession/getSession/getSessions/
// listSessions) all drove or queried a LOCAL Baileys socket — dead weight now
// that session lifecycle lives entirely in the whatsapp-service microservice
// (WhatsAppService.ts's facade calls it over HTTP instead). Confirmed zero
// external callers before removal. Only updateSession/isCompanyConnected
// survive: pure DB bookkeeping that doesn't touch a socket at all.
// [PERF] isCompanyConnected is polled every few hundred ms by the message
// queue worker's waitForSession loop while a session is reconnecting. A
// short TTL cache keeps that polling from hammering Postgres with an
// identical query multiple times a second — worst case it delays detecting
// a just-reconnected session by one TTL window, which the poll loop already
// tolerates by design.
const CONNECTED_CACHE_TTL_MS = 2000;

export class WhatsAppSessionService {
  private connectedCache = new Map<string, { value: boolean; expiresAt: number }>();

  constructor(
    private sessionManager: ISessionManager,
    private sessionRepository: WhatsAppSessionRepository,
  ) {}

  async updateSession(
    companyId: string,
    sessionId: string,
    data: { defaultQueueId?: string | null; proxyUrl?: string | null },
  ) {
    const session = await this.sessionRepository.findOne(companyId, sessionId);
    if (!session) {
      throw new AppError("Session not found or unauthorized", 404);
    }

    const updateData: Prisma.WhatsAppSessionUpdateInput = {};
    if (data.defaultQueueId !== undefined) {
      updateData.defaultQueue = data.defaultQueueId
        ? { connect: { id: data.defaultQueueId } }
        : { disconnect: true };
    }
    if (data.proxyUrl !== undefined) {
      updateData.proxyUrl = data.proxyUrl;
    }

    return this.sessionRepository.update(companyId, sessionId, updateData);
  }

  async isCompanyConnected(companyId: string): Promise<boolean> {
    if (this.sessionManager.hasActiveSessionInMemory(companyId)) {
      return true;
    }

    const cached = this.connectedCache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const sessions = await this.sessionRepository.findByStatus("CONNECTED", [
      companyId,
    ]);
    const value = sessions.length > 0;
    this.connectedCache.set(companyId, { value, expiresAt: Date.now() + CONNECTED_CACHE_TTL_MS });
    return value;
  }
}
