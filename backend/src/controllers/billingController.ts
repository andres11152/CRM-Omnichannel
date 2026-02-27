import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { billingService } from "@/services/billingService";
import { AuthenticatedRequest } from "@/types/types";

export const getTransactions = catchAsync(async (_req, res: Response) => {
  const data = await billingService.getTransactionsWithStats();
  res.json(data);
});

export const retryTransaction = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { transactionId } = req.body;

    const txn = await billingService.retryTransaction(transactionId);

    if (!txn) {
      res
        .status(404)
        .json({ status: "error", message: "Transaction not found" });
      return;
    }

    res.json({
      status: "success",
      message: "Cobro reprogramado. El estado se actualizará en breve.",
      newStatus: "pending",
    });
  },
);
