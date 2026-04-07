import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AppError } from "@/utils/AppError";

// In-memory store for CSRF tokens (in production, use Redis)
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

// Cleanup expired tokens every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [userId, data] of csrfTokens.entries()) {
      if (data.expiresAt < now) {
        csrfTokens.delete(userId);
      }
    }
  },
  5 * 60 * 1000,
);

/**
 * [SEC] CSRF Token Generator
 * Generates a unique token for each user session
 */
export const generateCsrfToken = (userId: string): string => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  csrfTokens.set(userId, { token, expiresAt });
  return token;
};

/**
 * [SEC] CSRF Token Validator Middleware
 * Validates CSRF token for state-changing operations (POST, PUT, DELETE, PATCH)
 */
export const validateCsrfToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip CSRF for login/signup (no session yet)
  if (
    req.path.includes("/auth/login") ||
    req.path.includes("/auth/signup") ||
    req.path.includes("/auth/forgot-password") ||
    req.path.includes("/auth/reset-password")
  ) {
    return next();
  }

  const userId = (req as unknown as { user?: { id?: string } }).user?.id;
  if (!userId) {
    throw new AppError("Authentication required for CSRF validation", 401);
  }

  const tokenFromHeader = req.headers["x-csrf-token"] as string;
  const tokenFromBody = req.body?._csrf;
  const clientToken = tokenFromHeader || tokenFromBody;

  if (!clientToken) {
    throw new AppError("CSRF token missing", 403);
  }

  const storedData = csrfTokens.get(userId);
  if (!storedData) {
    throw new AppError("CSRF token expired or invalid", 403);
  }

  if (storedData.expiresAt < Date.now()) {
    csrfTokens.delete(userId);
    throw new AppError("CSRF token expired", 403);
  }

  if (storedData.token !== clientToken) {
    throw new AppError("CSRF token mismatch", 403);
  }

  // Token is valid, continue
  next();
};

/**
 * [SEC] CSRF Token Endpoint
 * GET /api/csrf-token - Returns a fresh CSRF token for the authenticated user
 */
export const getCsrfTokenHandler = (req: Request, res: Response) => {
  const userId = (req as unknown as { user?: { id?: string } }).user?.id;
  if (!userId) {
    throw new AppError("Authentication required", 401);
  }

  const token = generateCsrfToken(userId);
  res.json({ csrfToken: token });
};
