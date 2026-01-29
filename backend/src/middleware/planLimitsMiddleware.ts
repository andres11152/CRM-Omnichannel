import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";
import { planLimitsService } from "@/services/planLimitsService";
import TenantContextManager from "@/config/tenantContext";

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

      console.log(
        `[PlanLimit] Checking limit for ${resourceType}. CompanyId: ${companyId}`,
      );

      if (!companyId) {
        console.log("[PlanLimit] No companyId, skipping check.");
        // No company = MASTER user or special case, allow
        return next();
      }

      // 🛡️ ENFORCE TENANT CONTEXT for Async Safety
      return TenantContextManager.run(
        {
          companyId,
          userId: req.user?.id || "unknown",
          requestId: "check-plan-limit",
        },
        async () => {
          console.log("[PlanLimit] Can create resource?");
          const canCreate = await planLimitsService.canCreateResource(
            companyId,
            resourceType,
          );
          console.log(`[PlanLimit] Can create: ${canCreate}`);

          if (!canCreate) {
            console.log("[PlanLimit] Limit reached, fetching details...");
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
      console.error("[PlanLimit] Error checking limit:", error);
      next(error);
    }
  };
};
