import { prisma, ExtendedPrismaClient } from "@/config/database";
import { Prisma } from "@prisma/client";

interface ExtendedSoftDeleteDelegate {
  deleteMany(args: {
    where: { companyId: string; [key: string]: unknown };
    includeDeleted?: boolean;
  }): Promise<Prisma.BatchPayload>;

  count(args: {
    where: { companyId: string; [key: string]: unknown };
    includeDeleted?: boolean;
  }): Promise<number>;
}

export class GdprCleanupRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  getModel(
    modelName: "contact" | "deal" | "ticket" | "campaign",
  ): ExtendedSoftDeleteDelegate | null {
    switch (modelName) {
      case "contact":
        return this.db.contact as unknown as ExtendedSoftDeleteDelegate;
      case "deal":
        return this.db.deal as unknown as ExtendedSoftDeleteDelegate;
      case "ticket":
        return this.db.ticket as unknown as ExtendedSoftDeleteDelegate;
      case "campaign":
        return this.db.campaign as unknown as ExtendedSoftDeleteDelegate;
      default:
        return null;
    }
  }

  async getCompaniesForCleanup() {
    return this.db.company.findMany({
      select: { id: true },
      where: { status: { not: "BANNED" } },
    });
  }

  async getAllCompanyIds() {
    return this.db.company.findMany({ select: { id: true } });
  }

  async safelyDeleteRecords(
    modelName: "contact" | "deal" | "ticket" | "campaign",
    whereClause: { companyId: string; deletedAt: { not: null; lt: Date } },
  ): Promise<number> {
    const delegate = this.getModel(modelName);
    if (!delegate) return 0;
    const result = await delegate.deleteMany({
      where: whereClause,
      includeDeleted: true,
    });
    return result.count;
  }

  async safelyCountRecords(
    modelName: "contact" | "deal" | "ticket" | "campaign",
    whereClause: { companyId: string; deletedAt: { not: null; lt?: Date } },
  ): Promise<number> {
    const delegate = this.getModel(modelName);
    if (!delegate) return 0;
    return await delegate.count({
      where: whereClause,
      includeDeleted: true,
    });
  }
}

export const gdprCleanupRepository = new GdprCleanupRepository();
