import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { analyticsService } from "@/services/analyticsService";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";

export const getHeatmap = catchAsync(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const companyId = (req as AuthenticatedRequest).user?.companyId;
  const userRole = (req as AuthenticatedRequest).user?.role;

  if (!companyId) {
    throw new AppError("Company ID required", 400);
  }

  // Optional: Restrict to ADMIN/SUPERVISOR if needed
  // if (userRole !== 'ADMIN' && userRole !== 'SUPERVISOR') throw new AppError("Access denied", 403);

  const start = startDate
    ? new Date(startDate as string)
    : new Date(new Date().setDate(new Date().getDate() - 30));
  const end = endDate ? new Date(endDate as string) : new Date();

  const data = await analyticsService.getHeatmapData(companyId, start, end);

  res.status(200).json({
    status: "success",
    data,
  });
});

export const getAgentPerformance = catchAsync(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;
    const companyId = (req as AuthenticatedRequest).user?.companyId;

    if (!companyId) throw new AppError("Company ID required", 400);

    const start = startDate
      ? new Date(startDate as string)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate as string) : new Date();

    const data = await analyticsService.getAgentPerformance(
      companyId,
      start,
      end
    );

    res.status(200).json({
      status: "success",
      data,
    });
  }
);

export const getTagAnalytics = catchAsync(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;
    const companyId = (req as AuthenticatedRequest).user?.companyId;

    if (!companyId) throw new AppError("Company ID required", 400);

    const start = startDate
      ? new Date(startDate as string)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate as string) : new Date();

    const data = await analyticsService.getTagAnalytics(companyId, start, end);

    res.status(200).json({
      status: "success",
      data,
    });
  }
);
