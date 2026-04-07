import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";
import { planLimitsService } from "@/services/PlanLimitsService";
import TenantContextManager from "@/config/tenantContext";
import { Logger } from "@/utils/logger";

type ResourceType = "users" | "whatsapp_sessions" | "queues" | "ai_assistants";

/**
 * Middleware to check plan limits before creating a resource
 * Usage: router.post('/users', checkPlanLimit('users'), createUser)
 */
export const checkPlanLimit = (resourceType: ResourceType) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const companyId = req.companyId || req.user?.companyId;

      Logger.debug(
        `[PlanLimit] Checking limit for ${resourceType}. CompanyId: ${companyId}`,
      );

      if (!companyId) {
        Logger.debug("[PlanLimit] No companyId, skipping check.");
        // No company = MASTER user or special case, allow
        return next();
      }

      // [SEC] ENFORCE TENANT CONTEXT for Async Safety
      return TenantContextManager.run(
        {
          companyId,
          userId: req.user?.id || "unknown",
          requestId: "check-plan-limit",
        },
        async () => {
          Logger.debug("[PlanLimit] Can create resource?");
          const canCreate = await planLimitsService.canCreateResource(
            companyId,
            resourceType,
          );
          Logger.debug(`[PlanLimit] Can create: ${canCreate}`);

          if (!canCreate) {
            Logger.debug("[PlanLimit] Limit reached, fetching details...");
            const { limit, current } = await planLimitsService.checkPlanLimit(
              companyId,
              resourceType,
            );

            return next(
              new AppError(
                `Plan limit reached: You have ${current}/${limit} ${resourceType.replace(
                  "_",
                  " ",
                )}. Please upgrade your plan to add more.`,
                403,
              ),
            );
          }

          next();
        },
      );
    } catch (error) {
      Logger.error("[PlanLimit] Error checking limit:", error);
      next(error);
    }
  };
};
