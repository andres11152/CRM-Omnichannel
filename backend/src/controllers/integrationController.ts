import { Request, Response } from "express";
// ️ REFACTOR: Unified Service
import { whatsappService } from "@/whatsapp";
import { AuthenticatedRequest } from "@/types/types";
import { Logger } from "@/utils/logger";

export const syncMessages = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const companyId = authReq.companyId || authReq.user?.companyId;
    const { fromDate } = req.body;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID missing" });
    }

    if (!fromDate) {
      return res.status(400).json({ message: "fromDate is required" });
    }

    // Trigger synchronization
    const result = await whatsappService.syncMessages(
      companyId,
      new Date(fromDate),
    );
    res.json({
      message: "Sync started successfully",
      stats: result,
    });
  } catch (error) {
    Logger.error("Sync error:", error);
    res.status(500).json({ message: "Failed to sync messages" });
  }
};
