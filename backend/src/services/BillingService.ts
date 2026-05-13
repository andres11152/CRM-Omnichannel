import { billingRepository } from "@/repositories/BillingRepository";
import { Logger } from "@/utils/logger";

/**
 * [BILLING] BILLING CRUD SERVICE
 */
export const billingService = {
  async getTransactionsWithStats() {
    const transactionsData =
      await billingRepository.findRecentTransactionsWithCompany(50);

    const transactions = transactionsData.map((tx) => ({
      id: tx.id,
      tenant: {
        name: tx.company.name,
        email: tx.company.defaultSenderEmail || "no-email@example.com",
        avatar:
          tx.company.logoUrl || tx.company.name.substring(0, 2).toUpperCase(),
      },
      description: tx.description,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      date: tx.billingDate.toISOString(),
      invoiceId: tx.invoiceId || "N/A",
    }));

    // Stats for today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const statsGroups = await billingRepository.getStatsByStatusAndDate(
      startOfDay,
      endOfDay,
    );

    let succeeded_count = 0;
    let failed_count = 0;
    let refunds_count = 0;
    let revenue_today = 0;

    statsGroups.forEach((group) => {
      const count = group._count.status;
      const amount = group._sum.amount || 0;
      if (group.status === "succeeded") {
        succeeded_count = count;
        revenue_today = amount;
      } else if (group.status === "failed") {
        failed_count = count;
      } else if (group.status === "refunded") {
        refunds_count = count;
      }
    });

    return {
      transactions,
      stats: { succeeded_count, failed_count, refunds_count, revenue_today },
    };
  },

  async retryTransaction(transactionId: string) {
    const txn = await billingRepository.findById(transactionId);
    if (!txn) return null;

    await billingRepository.updateStatus(transactionId, "pending");

    Logger.info(`[Billing] Transaction ${transactionId} retried`);
    return txn;
  },
};
