import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { featureFlagService } from "@/services/admin/FeatureFlagService";
import { catchAsync } from "@/utils/catchAsync";
import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";

export const getCompanyFeatureFlags = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) throw new AppError("ID de empresa requerido", 400);

    const flags = await featureFlagService.getCompanyFlags(companyId);
    res.json(flags);
  }
);

export const updateCompanyFeatureFlags = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;
    const { flags } = req.body;

    if (!companyId) throw new AppError("ID de empresa requerido", 400);
    if (!flags) throw new AppError("Configuración de flags requerida", 400);

    Logger.info(`[FeatureFlagController] Master updating flags for ${companyId} [User: ${req.user?.email}]`);
    
    const updated = await featureFlagService.updateCompanyFlags(companyId, flags);
    res.json(updated);
  }
);
