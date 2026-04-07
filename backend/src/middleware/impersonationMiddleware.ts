import { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";

/**
 * [SEC] SECURE IMPERSONATION MIDDLEWARE
 * Validates impersonation token from X-Impersonation-Token header
 * This prevents token exposure in URLs/logs
 */
export const handleImpersonation = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const impersonationToken = req.headers["x-impersonation-token"] as string;

  if (!impersonationToken) {
    // No impersonation, continue normally
    return next();
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new AppError("JWT secret not configured", 500);
    }

    // Verify the impersonation token
    const decoded = verify(impersonationToken, secret) as {
      id: string;
      email: string;
      role: string;
      companyId: string;
    };

    // Log impersonation for audit trail
    Logger.warn(
      `[Security] Impersonation active: User ${decoded.id} (${decoded.email}) via token`,
    );

    // Attach decoded user to request
    (req as unknown as { user: unknown }).user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId,
      isImpersonating: true, // Flag for audit purposes
    };

    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error("[Security] Invalid impersonation token:", message);
    throw new AppError("Invalid or expired impersonation token", 401);
  }
};
