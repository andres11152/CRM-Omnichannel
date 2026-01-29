import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { dashboardService } from "@/services/dashboardService";

/**
 * 🚀 DASHBOARD CONTROLLER (Refactored)
 * Delivers aggregated stats via specialized DashboardService.
 * Clean, Thin, and Efficient.
 */

export const getDashboardStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID required" });
    }

    const stats = await dashboardService.getDashboardStats(companyId);

    // Service handles caching internally if needed, or we just return DTO
    res.status(200).json({
      status: "success",
      data: stats,
    });
  },
);

export const getSalesStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID required" });
    }

    const stats = await dashboardService.getSalesStats(companyId);

    res.status(200).json({
      status: "success",
      data: stats,
    });
  },
);

export const getDashboardOverview = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID required" });
    }

    const overview = await dashboardService.getDashboardOverview(companyId);

    res.status(200).json({
      status: "success",
      data: overview,
    });
  },
);
