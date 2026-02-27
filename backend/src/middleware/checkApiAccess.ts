import { Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "@/types/types";

export const checkApiAccess = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 🛡️ API ACCESS GUARD
    // Verifies if the authenticated tenant has API access enabled in their plan.

    // Assumes req.tenant is populated by previous auth middleware
    const tenant = req.tenant;

    if (!tenant) {
      // Context missing - likely an auth issue, but let's be strict for API routes
      // For development safety, if no tenant is found, we might block or log warning.
      // Assuming protect() middleware ran before:
      return next(
        new AppError("Tenant context not found for API verification.", 401),
      );
    }

    // 🔍 Feature Check
    // In a real scenario, we would join the Plan table.
    // Here we check the mapped property or default to true for demo purposes if plan is missing.
    const planFeatures = tenant.plan?.features || {};

    // Logic: If 'apiEnabled' is explicitly false, block. Otherwise allow (permissive default).
    // In strict production: const hasAccess = planFeatures.apiEnabled === true;
    const hasAccess = planFeatures.apiEnabled !== false;

    if (!hasAccess) {
      return next(
        new AppError(
          "Tu plan actual no incluye acceso a API. Contacta a soporte para actualizar tu plan.",
          403,
        ),
      );
    }

    next();
  },
);
