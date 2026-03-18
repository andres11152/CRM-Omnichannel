import { prisma } from "@/config/database";
import { WhatsAppSession, Prisma } from "@prisma/client";

export class WhatsAppSessionRepository {
  /**
   * Find all sessions for a specific company
   */
  async findByCompany(companyId: string): Promise<WhatsAppSession[]> {
    return prisma.whatsAppSession.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find a specific session by ID, scoped by company
   */
  async findOne(
    companyId: string,
    sessionId: string,
  ): Promise<WhatsAppSession | null> {
    return prisma.whatsAppSession.findFirst({
      where: { companyId, sessionId },
    });
  }

  /**
   * System-level lookup for Webhooks/Callbacks ONLY
   */
  async findSystemSession(sessionId: string): Promise<WhatsAppSession | null> {
    return prisma.whatsAppSession.findFirst({
      where: { sessionId },
    });
  }

  /**
   * Update session data by sessionId natively for easy usage
   */
  async update(
    companyId: string,
    sessionId: string,
    data: Prisma.WhatsAppSessionUpdateInput,
  ): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppSession.updateMany({
      where: { companyId, sessionId },
      data,
    });
  }

  /**
   * System-level update for Callbacks ONLY
   */
  async updateSystemSession(
    sessionId: string,
    data: Prisma.WhatsAppSessionUpdateInput,
  ): Promise<WhatsAppSession> {
    return prisma.whatsAppSession.update({
      where: { sessionId },
      data,
    });
  }

  /**
   * Generic update with Prisma args
   */
  async updateRaw(
    companyId: string,
    args: Omit<Prisma.WhatsAppSessionUpdateArgs, "where"> & {
      where: Prisma.WhatsAppSessionWhereUniqueInput;
    },
  ): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppSession.updateMany({
      where: { ...args.where, companyId },
      data: args.data,
    });
  }

  /**
   * Count sessions
   */
  async count(
    companyId: string,
    args?: Omit<Prisma.WhatsAppSessionCountArgs, "where"> & {
      where?: Prisma.WhatsAppSessionWhereInput;
    },
  ): Promise<number> {
    return prisma.whatsAppSession.count({
      ...args,
      where: { ...args?.where, companyId },
    });
  }

  /**
   * Delete a session
   */
  async delete(
    companyId: string,
    sessionId: string,
  ): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppSession.deleteMany({
      where: { companyId, sessionId },
    });
  }

  /**
   * Create a new session
   */
  async create(
    data: Prisma.WhatsAppSessionCreateInput,
  ): Promise<WhatsAppSession> {
    return prisma.whatsAppSession.create({ data });
  }

  /**
   * Find sessions by status (useful for cleanup/init)
   */
  async findByStatus(
    status: string | string[],
    companies?: string[],
  ): Promise<WhatsAppSession[]> {
    const where: Prisma.WhatsAppSessionWhereInput = {};

    if (Array.isArray(status)) {
      where.status = { in: status };
    } else {
      where.status = status;
    }

    if (companies) {
      where.companyId = { in: companies };
    }

    return prisma.whatsAppSession.findMany({ where });
  }

  /**
   * Internal lookup across companies
   */
  async findManySystem(args: Prisma.WhatsAppSessionFindManyArgs) {
    return prisma.whatsAppSession.findMany(args);
  }

  async findMany(
    companyId: string,
    args: Omit<Prisma.WhatsAppSessionFindManyArgs, "where"> & {
      where?: Prisma.WhatsAppSessionWhereInput;
    },
  ) {
    return prisma.whatsAppSession.findMany({
      ...args,
      where: { ...args.where, companyId },
    });
  }

  /**
   * Delete many sessions (useful for cleanup)
   */
  async deleteMany(
    companyId: string,
    where: Prisma.WhatsAppSessionWhereInput,
  ): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppSession.deleteMany({
      where: { ...where, companyId },
    });
  }

  /**
   * 🛡️ SELF-HEALING: Create/restore a session record (idempotent via upsert).
   * Used when connection.update fires "open" but the DB record was deleted (cleanup).
   */
  async createSessionRecord(data: {
    sessionId: string;
    companyId: string;
    status: string;
    phone: string | null;
  }): Promise<WhatsAppSession> {
    return prisma.whatsAppSession.upsert({
      where: { sessionId: data.sessionId },
      create: {
        sessionId: data.sessionId,
        company: { connect: { id: data.companyId } },
        status: data.status,
        phone: data.phone,
      },
      update: {
        status: data.status,
        phone: data.phone,
        qrCode: null,
      },
    });
  }
}

export const whatsappSessionRepository = new WhatsAppSessionRepository();
