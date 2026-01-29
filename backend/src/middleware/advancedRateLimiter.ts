import rateLimit from "express-rate-limit";
import { Request } from "express";
import { AppError } from "@/utils/AppError";

/**
 * 🛡️ ADVANCED RATE LIMITING
 * Per-user + per-company rate limiting for granular control
 */

// Store for tracking user-specific limits
const userLimitStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of userLimitStore.entries()) {
    if (data.resetAt < now) {
      userLimitStore.delete(key);
    }
  }
}, 60 * 1000);

/**
 * 🔥 Per-User Rate Limiter
 * Limits requests per authenticated user (100 req/15min)
 */
export const userRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per user
  message: "Too many requests from this user, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,

  // Custom key generator: userId + companyId
  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    if (!user) {
      // Fallback to IP for unauthenticated requests
      return req.ip || "unknown";
    }
    return `user:${user.id}:company:${user.companyId}`;
  },

  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    const user = (req as any).user;
    const identifier = user
      ? `User ${user.id} (Company ${user.companyId})`
      : `IP ${req.ip}`;

    console.warn(`[RateLimit] ${identifier} exceeded limit on ${req.path}`);

    throw new AppError(
      "Rate limit exceeded. Please slow down your requests.",
      429
    );
  },

  // Skip rate limiting for certain paths
  skip: (req) => {
    // Don't rate limit health checks
    return req.path === "/health" || req.path === "/api/health";
  },
});

/**
 * 🔥 Strict Auth Rate Limiter
 * For sensitive auth endpoints (5 attempts/15min)
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request) => {
    // Use email + IP for login attempts
    const email = req.body?.email || "unknown";
    const ip = req.ip || "unknown";
    return `auth:${email}:${ip}`;
  },

  handler: (req, res) => {
    console.error(
      `[Security] Auth rate limit exceeded for ${req.body?.email} from ${req.ip}`
    );
    throw new AppError(
      "Too many login attempts. Please try again in 15 minutes.",
      429
    );
  },
});

/**
 * 🔥 Admin Action Rate Limiter
 * For critical admin operations (500 req/hour)
 */
export const adminRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500, // Increased from 20 to 500 for normal admin usage
  message: "Too many admin actions, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    return user ? `admin:${user.id}` : req.ip || "unknown";
  },

  handler: (req, res) => {
    const user = (req as any).user;
    console.warn(
      `[Security] Admin ${user?.id} exceeded rate limit on ${req.path}`
    );
    throw new AppError("Admin rate limit exceeded.", 429);
  },
});

/**
 * 🔥 WhatsApp Message Rate Limiter
 * Prevents spam (30 messages/minute per company)
 */
export const whatsappRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: "Too many messages sent, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    return user ? `whatsapp:company:${user.companyId}` : req.ip || "unknown";
  },

  handler: (req, res) => {
    const user = (req as any).user;
    console.warn(
      `[WhatsApp] Company ${user?.companyId} exceeded message rate limit`
    );
    throw new AppError(
      "Message rate limit exceeded. Please wait before sending more.",
      429
    );
  },
});


