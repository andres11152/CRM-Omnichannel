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
   * Find a specific session by ID, optionally filtered by company
   */
  async findOne(
    sessionId: string,
    companyId?: string,
  ): Promise<WhatsAppSession | null> {
    const where: Prisma.WhatsAppSessionWhereInput = { sessionId };
    if (companyId) {
      where.companyId = companyId;
    }
    return prisma.whatsAppSession.findFirst({ where });
  }

  /**
   * Update session data by sessionId natively for easy usage
   */
  async update(
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
    args: Prisma.WhatsAppSessionUpdateArgs,
  ): Promise<WhatsAppSession> {
    return prisma.whatsAppSession.update(args);
  }

  /**
   * Count sessions
   */
  async count(args: Prisma.WhatsAppSessionCountArgs): Promise<number> {
    return prisma.whatsAppSession.count(args);
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<WhatsAppSession> {
    return prisma.whatsAppSession.delete({
      where: { sessionId },
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

  async findMany(args: Prisma.WhatsAppSessionFindManyArgs) {
    return prisma.whatsAppSession.findMany(args);
  }

  /**
   * Delete many sessions (useful for cleanup)
   */
  async deleteMany(
    where: Prisma.WhatsAppSessionWhereInput,
  ): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppSession.deleteMany({ where });
  }
}

export const whatsappSessionRepository = new WhatsAppSessionRepository();
