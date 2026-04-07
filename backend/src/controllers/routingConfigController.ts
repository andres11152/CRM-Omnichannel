import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { routingConfigService } from "@/services/RoutingConfigService";

/**
 * GET /api/routing-config
 * Get routing configuration for the authenticated company
 */
export const getRoutingConfig = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      throw new AppError("Company ID required", 400);
    }

    const config = await routingConfigService.getConfig(companyId);

    res.status(200).json({
      status: "success",
      data: { config },
    });
  }
);

/**
 * PATCH /api/routing-config
 * Update routing configuration
 */
export const updateRoutingConfig = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      throw new AppError("Company ID required", 400);
    }

    // Only MASTER and ADMIN can update routing config
    if (req.user?.role !== "MASTER" && req.user?.role !== "ADMIN") {
      throw new AppError("Permission denied", 403);
    }

    const { enabled, defaultQueueId, aiAutoResponse, rules } = req.body;

    await routingConfigService.updateConfig(companyId, {
      enabled,
      defaultQueueId,
      aiAutoResponse,
      rules,
    });

    const updatedConfig = await routingConfigService.getConfig(companyId);

    res.status(200).json({
      status: "success",
      message: "Routing configuration updated successfully",
      data: { config: updatedConfig },
    });
  }
);
