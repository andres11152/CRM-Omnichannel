import { prisma } from "../config/database";

export interface WhatsAppSession {
  id: string;
  sessionId: string;
  companyId: string;
  proxyUrl: string | null;
  status: string;
  phone: string | null;
  qrCode: string | null;
  profileName: string | null;
  provider: string;
  defaultQueueId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class WhatsAppSessionRepository {
  async upsertProxy(
    sessionId: string,
    companyId: string,
    proxyUrl: string | null,
  ): Promise<WhatsAppSession> {
    return prisma.whatsAppSession.upsert({
      where: { sessionId },
      create: {
        sessionId,
        companyId,
        proxyUrl: proxyUrl || null,
        status: "DISCONNECTED",
      },
      update: {
        proxyUrl: proxyUrl || null,
      },
    }) as unknown as Promise<WhatsAppSession>;
  }
  async ensureSessionRecord(
    sessionId: string,
    companyId: string,
  ): Promise<WhatsAppSession> {
    return prisma.whatsAppSession.upsert({
      where: { sessionId },
      create: {
        sessionId,
        companyId,
        status: "DISCONNECTED",
        provider: "BAILEYS",
      },
      update: {},
    }) as unknown as Promise<WhatsAppSession>;
  }

  async findActiveSessions(): Promise<WhatsAppSession[]> {
    return prisma.whatsAppSession.findMany({
      where: { status: "CONNECTED", provider: "BAILEYS" },
    }) as unknown as Promise<WhatsAppSession[]>;
  }

  async findByCompany(companyId: string): Promise<WhatsAppSession[]> {
    return prisma.whatsAppSession.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    }) as unknown as Promise<WhatsAppSession[]>;
  }
}

export const whatsAppSessionRepository = new WhatsAppSessionRepository();
