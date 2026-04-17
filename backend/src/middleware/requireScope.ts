import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";

/**
 * Middleware to check if the current API key has the required scope.
 * If the user's scope array includes "*" (the default), it allows everything.
 */
export const requireScope = (requiredScope: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // If not an API key request, bypass (this middleware is meant for API Keys)
    if (!req.user?.apiKeyId) {
      return next();
    }

    const scopes = req.user.scopes || [];
    
    if (scopes.includes("*")) {
      return next();
    }

    if (!scopes.includes(requiredScope) && !scopes.includes(requiredScope.split(':')[0] + ':*')) {
      return next(
        new AppError(
          `Acceso denegado. Se requiere el scope '${requiredScope}' para esta acción.`,
          403,
        ),
      );
    }

    next();
  };
};
