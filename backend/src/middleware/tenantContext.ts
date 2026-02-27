import { Request, Response, NextFunction } from "express";
import { contextStorage } from "../context/requestContext";

// Extend Express Request to match your previous Auth middleware
interface AuthRequest extends Request {
  user?: {
    id: string;
    companyId: string;
    role: string;
    [key: string]: unknown;
  };
}

/**
 * Context Middleware
 * Wraps the entire request in the AsyncLocalStorage context.
 * MUST be placed AFTER the authentication middleware.
 */
export const tenantContextMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || !req.user.companyId) {
    // If route is public, we might not have user/companyId.
    // In that case, we proceed without context.
    // The Prisma extension will BLOCK access to tenant models automatically.
    return next();
  }

  const context = {
    userId: req.user.id,
    companyId: req.user.companyId,
    role: req.user.role,
  };

  // Use enterWith to persist context across the async chain linearly
  // This allows it to work as a standard Express middleware
  contextStorage.enterWith(context);
  next();
};
