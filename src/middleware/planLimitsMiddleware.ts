import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";
import { planLimitsService } from "@/services/planLimitsService";

type ResourceType = "users" | "whatsapp_sessions" | "queues" | "ai_assistants";

/**
 * Middleware to check plan limits before creating a resource
 * Usage: router.post('/users', checkPlanLimit('users'), createUser)
 */
export const checkPlanLimit = (resourceType: ResourceType) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const companyId = req.companyId || req.user?.companyId;

      if (!companyId) {
        // No company = MASTER user or special case, allow
        return next();
      }

      const canCreate = await planLimitsService.canCreateResource(
        companyId,
        resourceType
      );

      if (!canCreate) {
        const { limit, current } = await planLimitsService.checkPlanLimit(
          companyId,
          resourceType
        );

        return next(
          new AppError(
            `Plan limit reached: You have ${current}/${limit} ${resourceType.replace(
              "_",
              " "
            )}. Please upgrade your plan to add more.`,
            403
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
