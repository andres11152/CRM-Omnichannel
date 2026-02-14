import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { prisma } from "@/config/database";

export const getTransactions = catchAsync(async (req, res) => {
  // 1. Fetch real recent transactions
  // We use 'any' cast for prisma.billingTransaction temporarily if client is not fully regenerated in IDE context
  // but runtime should work fine after migration.
  const transactionsData = await (prisma as any).billingTransaction.findMany({
    take: 50,
    orderBy: { billingDate: "desc" },
    include: {
      company: {
        select: {
          name: true,
          defaultSenderEmail: true,
          logoUrl: true,
        },
      },
    },
  });

  // 2. Map to Frontend Interface
  const transactions = transactionsData.map((tx: any) => ({
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

  // 3. Calculate REAL Stats for Today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Use groupBy to aggregate stats efficiently
  const statsGroups = await (prisma as any).billingTransaction.groupBy({
    by: ["status"],
    where: {
      billingDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    _count: {
      status: true,
    },
    _sum: {
      amount: true,
    },
  });

  let succeeded_count = 0;
  let failed_count = 0;
  let refunds_count = 0;
  let revenue_today = 0;

  statsGroups.forEach((group: any) => {
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

  res.json({
    data: transactions,
    stats: {
      succeeded_count,
      failed_count,
      refunds_count,
      revenue_today,
    },
  });
});

export const retryTransaction = catchAsync(async (req: any, res: Response) => {
  const { transactionId } = req.body;

  // Verify transaction exists
  const txn = await (prisma as any).billingTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!txn) {
    res.status(404).json({ status: "error", message: "Transaction not found" });
    return;
  }

  // Update status in DB (Real Logic)
  await (prisma as any).billingTransaction.update({
    where: { id: transactionId },
    data: { status: "pending" },
  });

  // Placeholder for Stripe Logic (Real charge retry would go here)
  // await stripe.paymentIntents.confirm(txn.stripePaymentId);

  res.json({
    status: "success",
    message: "Cobro reprogramado. El estado se actualizará en breve.",
    newStatus: "pending",
  });
});
