import { prisma } from "@/config/database";
import { InstagramSession, Prisma } from "@prisma/client";
import { runAsSystem } from "@/context/requestContext";

export class InstagramSessionRepository {
  async findByCompany(companyId: string): Promise<InstagramSession[]> {
    return prisma.instagramSession.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(companyId: string, id: string): Promise<InstagramSession | null> {
    return prisma.instagramSession.findFirst({
      where: { companyId, id },
    });
  }

  async create(data: Prisma.InstagramSessionCreateInput): Promise<InstagramSession> {
    return prisma.instagramSession.create({ data });
  }

  async update(
    companyId: string,
    id: string,
    data: Prisma.InstagramSessionUpdateInput,
  ): Promise<Prisma.BatchPayload> {
    return prisma.instagramSession.updateMany({
      where: { companyId, id },
      data,
    });
  }

  async delete(companyId: string, id: string): Promise<Prisma.BatchPayload> {
    return prisma.instagramSession.deleteMany({
      where: { companyId, id },
    });
  }

  /**
   * System-level lookup for Webhooks/Callbacks ONLY (no company context yet).
   */
  async findActiveSessionByIgAccountId(igBusinessAccountId: string): Promise<InstagramSession | null> {
    return runAsSystem(() =>
      prisma.instagramSession.findFirst({
        where: { igBusinessAccountId, status: "CONNECTED" },
      })
    );
  }

  /**
   * Find a session by its verification token (used for Webhook verify challenge).
   */
  async findSessionByVerifyToken(token: string): Promise<InstagramSession | null> {
    return runAsSystem(() =>
      prisma.instagramSession.findFirst({
        where: { verifyToken: token },
      })
    );
  }
}

export const instagramSessionRepository = new InstagramSessionRepository();
