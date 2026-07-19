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
export class WhatsAppSessionService {
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

    const sessions = await this.sessionRepository.findByStatus("CONNECTED", [
      companyId,
    ]);
    return sessions.length > 0;
  }
}
