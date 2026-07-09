import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";
import { featureFlagService, FeatureFlags } from "@/services/admin/FeatureFlagService";
import { Logger } from "@/utils/logger";

/**
 * [SEC] FEATURE FLAG MIDDLEWARE
 * Enforces feature flag validation at the route/controller layer.
 * Blocks requests if the tenant does not have the override active.
 */
export const requireFeature = (featureKey: keyof FeatureFlags) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.companyId || req.user?.companyId;

      if (!companyId) {
        // Fallback for Master Admin or operations without company context
        return next();
      }

      const isEnabled = await featureFlagService.isFeatureEnabled(companyId, featureKey);

      if (!isEnabled) {
        Logger.warn(`[FeatureFlagGuard] Blocked access to ${featureKey} for company ${companyId}`);
        return next(
          new AppError(
            `Esta funcionalidad (${featureKey}) no está activa para su empresa. Contacte a soporte para habilitarla.`,
            403
          )
        );
      }

      next();
    } catch (error) {
      Logger.error(`[FeatureFlagGuard] Error checking flag ${featureKey}:`, error);
      next(error);
    }
  };
};
