import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { analyticsService } from "@/services/AnalyticsService";

/**
 * [STAT] ANALYTICS CONTROLLER (Refactored)
 * Delegates complex reporting to AnalyticsService.
 */

export const getFinancialAnalytics = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    // Admin check usually done in middleware
    const stats = await analyticsService.getFinancialAnalytics();
    res.json(stats);
  },
);

export const getHeatmap = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId)
      return res.status(400).json({ message: "Company ID required" });

    const { startDate, endDate } = req.query;
    const data = await analyticsService.getHeatmap(
      companyId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
    );
    res.json({ status: "success", data });
  },
);

export const getAgentPerformance = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId)
      return res.status(400).json({ message: "Company ID required" });

    const { startDate, endDate } = req.query;
    const data = await analyticsService.getAgentPerformance(
      companyId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
    );
    res.json({ status: "success", data });
  },
);

export const getTagAnalytics = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId)
      return res.status(400).json({ message: "Company ID required" });

    const { startDate, endDate } = req.query;
    const data = await analyticsService.getTagAnalytics(
      companyId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
    );
    res.json({ status: "success", data });
  },
);

export const getGlobalActivity = catchAsync(async (req, res) => {
  // Mock Data
  const data = analyticsService.getGlobalActivity();
  res.json(data);
});

export const getTenantHealth = catchAsync(async (req, res) => {
  // Mock Data
  const data = analyticsService.getTenantHealth();
  res.json(data);
});

export const exportAgentPerformance = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId)
      return res.status(400).json({ message: "Company ID required" });

    const { startDate, endDate, format = "csv" } = req.query;
    const result = await analyticsService.generateAgentExport(
      companyId,
      {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      },
      String(format),
      req.user?.name || req.user?.email || "User",
    );

    res.json({
      status: "success",
      data: result,
    });
  },
);

export const exportTicketAnalytics = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId)
      return res.status(400).json({ message: "Company ID required" });

    const { startDate, endDate, format = "csv" } = req.query;
    const result = await analyticsService.generateTicketExport(
      companyId,
      {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      },
      String(format),
      req.user?.name || req.user?.email || "User",
    );

    res.json({
      status: "success",
      data: result,
    });
  },
);
