import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { salesAnalyticsService } from "@/services/SalesAnalyticsService";
import { dealRiskService } from "@/services/DealRiskService";

function parseDateRange(req: AuthenticatedRequest) {
  const { startDate, endDate } = req.query;
  return {
    start: startDate ? new Date(startDate as string) : undefined,
    end: endDate ? new Date(endDate as string) : undefined,
  };
}

export const getForecast = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { start, end } = parseDateRange(req);
    const data = await salesAnalyticsService.getForecast(companyId, start, end);
    res.json({ status: "success", data });
  },
);

export const getStageConversion = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const data = await salesAnalyticsService.getStageConversion(companyId);
    res.json({ status: "success", data });
  },
);

export const getStageVelocity = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const data = await salesAnalyticsService.getStageVelocity(companyId);
    res.json({ status: "success", data });
  },
);

export const getLostReasons = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { start, end } = parseDateRange(req);
    const data = await salesAnalyticsService.getLostReasonBreakdown(
      companyId,
      start,
      end,
    );
    res.json({ status: "success", data });
  },
);

export const getRepLeaderboard = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { start, end } = parseDateRange(req);
    const data = await salesAnalyticsService.getRepLeaderboard(
      companyId,
      start,
      end,
    );
    res.json({ status: "success", data });
  },
);

export const exportLeaderboard = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { start, end } = parseDateRange(req);
    const format = String(req.query.format || "csv");
    const result = await salesAnalyticsService.generateLeaderboardExport(
      companyId,
      { startDate: start, endDate: end },
      format,
      req.user?.name || req.user?.email || "User",
    );
    res.json({ status: "success", data: result });
  },
);

export const getDealRisk = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const data = await dealRiskService.getRiskScoresForOpenDeals(companyId);
    // Riskiest first — that's the order a rep actually wants to work through.
    data.sort((a, b) => b.riskScore - a.riskScore);
    res.json({ status: "success", data });
  },
);

export const exportLostReasons = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { start, end } = parseDateRange(req);
    const format = String(req.query.format || "csv");
    const result = await salesAnalyticsService.generateLostReasonsExport(
      companyId,
      { startDate: start, endDate: end },
      format,
      req.user?.name || req.user?.email || "User",
    );
    res.json({ status: "success", data: result });
  },
);
