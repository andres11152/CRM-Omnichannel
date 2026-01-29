import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";

export const getTransactions = catchAsync(async (req, res) => {
  // 🏦 BILLING OPS SIMULATION
  // This mocks a real Ledger/Payment Gateway query (e.g. Stripe API)

  const companies = [
    { name: "Tech Solutions Inc.", email: "finance@tech.com" },
    { name: "Global Logistics", email: "billing@glogistics.com" },
    { name: "Apex Consulting", email: "carlos@apex.com" },
    { name: "Demo Tenant", email: "admin@demo.com" },
    { name: "NextGen AI", email: "ops@nextgen.ai" },
  ];

  const plans = [
    { name: "Plan Pro Mensual", amount: 4900 },
    { name: "Plan Enterprise Anual", amount: 500000 },
    { name: "Add-on WhatsApp Pack", amount: 1500 },
    { name: "Plan Basic", amount: 2900 },
  ];

  // Generate 50 realistic transactions
  const transactions = Array.from({ length: 50 }).map((_, i) => {
    const company = companies[Math.floor(Math.random() * companies.length)];
    const plan = plans[Math.floor(Math.random() * plans.length)];

    // Weighted probability for realistic status
    const rand = Math.random();
    let status = "succeeded";
    if (rand > 0.85) status = "failed";
    else if (rand > 0.95) status = "refunded";
    else if (rand > 0.98) status = "pending";

    return {
      id: `txn_${10000 + i}`,
      tenant: {
        name: company.name,
        email: company.email,
        avatar: company.name.substring(0, 2).toUpperCase(),
      },
      description: plan.name,
      amount: plan.amount, // in cents/min unit usually, keeping clean UI value here
      currency: "USD",
      status: status as "succeeded" | "failed" | "refunded" | "pending",
      date: new Date(
        Date.now() - i * 1000 * 60 * 60 * (1 + Math.random() * 10)
      ).toISOString(),
      invoiceId: `INV-${2024000 + i}`,
    };
  });

  // Calculate Live Stats from the mock data (filtering 'today' loosely as top 10 items)
  const todayTxns = transactions.slice(0, 10);
  const succeededToday = todayTxns.filter(
    (t) => t.status === "succeeded"
  ).length;
  const failedToday = todayTxns.filter((t) => t.status === "failed").length;
  const refundsToday = todayTxns.filter((t) => t.status === "refunded").length;

  res.json({
    data: transactions,
    stats: {
      succeeded_count: succeededToday,
      failed_count: failedToday,
      refunds_count: refundsToday,
      revenue_today: todayTxns
        .filter((t) => t.status === "succeeded")
        .reduce((acc, curr) => acc + curr.amount, 0),
    },
  });
});

export const retryTransaction = catchAsync(async (req: any, res: Response) => {
  const { transactionId } = req.body;

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Here we would call: await stripe.paymentIntents.confirm(...)
  console.log(`[BillingOps] Retrying charge for ${transactionId}`);

  res.json({
    status: "success",
    message:
      "Cobro reintentado exitosamente. El estado se actualizará en unos segundos.",
    newStatus: "pending",
  });
});
