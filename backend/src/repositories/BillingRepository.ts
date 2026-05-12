import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client";

export const billingRepository = {
  findMany(args: Prisma.BillingTransactionFindManyArgs) {
    return prisma.billingTransaction.findMany(args);
  },
  findRecentTransactionsWithCompany(take: number = 50) {
    return prisma.billingTransaction.findMany({
      take,
      orderBy: { billingDate: "desc" },
      include: {
        company: {
          select: { name: true, defaultSenderEmail: true, logoUrl: true },
        },
      },
    });
  },

  getStatsByStatusAndDate(startDate: Date, endDate: Date) {
    return prisma.billingTransaction.groupBy({
      by: ["status"],
      where: { billingDate: { gte: startDate, lte: endDate } },
      _count: { status: true },
      _sum: { amount: true },
    });
  },

  findById(id: string) {
    return prisma.billingTransaction.findUnique({
      where: { id },
    });
  },

  updateStatus(id: string, status: string) {
    return prisma.billingTransaction.update({
      where: { id },
      data: { status },
    });
  },
};
