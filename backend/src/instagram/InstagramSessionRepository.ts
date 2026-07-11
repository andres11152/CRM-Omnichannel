import { prisma } from "@/config/database";
import { InstagramSession, Prisma } from "@prisma/client";
import { runAsSystem } from "@/context/requestContext";
import { AppError } from "@/utils/AppError";

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
    try {
      return await prisma.instagramSession.create({ data });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("Esta cuenta de Instagram ya está conectada a otra empresa o sesión.", 409);
      }
      throw error;
    }
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
