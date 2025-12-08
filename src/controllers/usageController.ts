import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { catchAsync } from "@/utils/catchAsync";
import { planLimitsService } from "@/services/planLimitsService";
import { AppError } from "@/utils/AppError";

/**
 * GET /api/usage/stats
 * Returns current usage vs plan limits for the authenticated company
 */
export const getUsageStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      throw new AppError("Company ID not found", 400);
    }

    const [limits, usage] = await Promise.all([
      planLimitsService.getPlanLimits(companyId),
      planLimitsService.getCurrentUsage(companyId),
    ]);

    if (!limits) {
      return res.json({
        plan: null,
        usage,
        percentages: {},
      });
    }

    // Calculate percentages for each resource
    const percentages: Record<string, number> = {};

    Object.keys(usage).forEach((key) => {
      const limitKey = `max_${key}` as keyof typeof limits;
      const limit = limits[limitKey];
      const current = usage[key as keyof typeof usage];

      if (limit === -1) {
        percentages[key] = 0; // Unlimited
      } else if (limit) {
        percentages[key] = Math.round((current / limit) * 100);
      }
    });

    res.json({
      plan: {
        limits,
      },
      usage,
      percentages,
    });
  }
);
