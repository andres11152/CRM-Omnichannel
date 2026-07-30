import { prisma } from "../config/database";

export class DealStageHistoryRepository {
  async create(data: {
    companyId: string;
    dealId: string;
    fromStageId: string | null;
    toStageId: string | null;
    valueAtChange: number;
    changedById: string | null;
  }) {
    return prisma.dealStageHistory.create({ data });
  }

  /**
   * Most recent time this deal entered `toStageId` — the basis for "days
   * in current stage" (condition evaluation, stall detection). Returns
   * null for deals that moved into their current stage before the
   * history log started recording, or that never changed stage.
   */
  async findLatestStageEntry(companyId: string, dealId: string, toStageId: string) {
    return prisma.dealStageHistory.findFirst({
      where: { companyId, dealId, toStageId },
      orderBy: { changedAt: "desc" },
    });
  }
}

export const dealStageHistoryRepository = new DealStageHistoryRepository();
