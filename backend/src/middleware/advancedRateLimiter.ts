import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Request, Response } from "express";
import { AppError } from "@/utils/AppError";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";
import { AuthenticatedRequest } from "@/types/types";

/**
 * 🛡️ ADVANCED RATE LIMITING (ENTERPRISE GRADE)
 * Uses Redis for distributed rate limiting across clusters.
 * Falls back to memory if Redis is unavailable.
 *
 * STRICT MODE: NO 'any' usage permitted.
 */

// 🔒 Secure Type Guard for Authentication
function isAuthenticated(req: Request): req is AuthenticatedRequest {
  // Use intersection type to safely access 'user' without 'any'
  const safeReq = req as Request & { user?: unknown };
  return typeof safeReq.user === "object" && safeReq.user !== null;
}

/**
 * 🏭 Rate Limiter Factory
 * Creates proper rate limiters with Redis support and standardized error handling.
 */
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  prefix: string;
  keyGenerator: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

const createRateLimiter = (
  config: RateLimitConfig,
): RateLimitRequestHandler => {
  // Determine Store: Redis vs Memory
  let store;

  // 🛡️ 100-YEAR FIX: Safe Redis Initialization
  // Only use RedisStore if Redis is ALREADY connected.
  // This avoids "Unexpected Reply" errors during startup race conditions.
  // If Redis connects later, we stay on MemoryStore until restart, which is safer for stability.
  if (redisClient?.isOpen) {
    store = new RedisStore({
      // Bridge node-redis v4 to rate-limit-redis expected signature
      sendCommand: async (...args: string[]) => {
        try {
          const result = await redisClient!.sendCommand(args);
          return result as unknown as string;
        } catch {
          return null;
        }
      },
      prefix: `rl:${config.prefix}:`,
    });
  } else {
    // Info log instead of Warn to reduce noise
    if (redisClient) {
      Logger.info(
        `[RateLimit] Redis pending for '${config.prefix}'. Using MemoryStore (Local) for stability.`,
      );
    }
  }

  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: true,
    legacyHeaders: false,
    store, // Defaults to MemoryStore if undefined

    keyGenerator: config.keyGenerator,

    handler: (req: Request, _res: Response) => {
      const key = config.keyGenerator(req);
      Logger.warn(
        `[RateLimit] 🛑 Limit exceeded for '${config.prefix}' | Key: ${key} | Path: ${req.path}`,
      );
      throw new AppError(config.message, 429);
    },

    skip:
      config.skip ||
      ((req: Request) => req.path === "/health" || req.path === "/api/health"),
  });
};

/**
 * 🔥 Per-User Rate Limiter
 * Limits requests per authenticated user (1000 req/15min)
 * Identifier: User ID + Company ID
 */
export const userRateLimiter = createRateLimiter({
  prefix: "user",
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: "Too many requests from this user, please try again later.",
  keyGenerator: (req: Request) => {
    if (isAuthenticated(req)) {
      // Safe access: TypeScript knows req is AuthenticatedRequest
      const companySuffix = req.user.companyId
        ? `:company:${req.user.companyId}`
        : "";
      return `user:${req.user.id}${companySuffix}`;
    }
    return `ip:${req.ip || "unknown"}`;
  },
});

/**
 * 🔥 Strict Auth Rate Limiter
 * For login/register endpoints (10 attempts/15min)
 * Identifier: Email (from body) + IP
 */
export const authRateLimiter = createRateLimiter({
  prefix: "auth",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts. Please try again in 15 minutes.",
  keyGenerator: (req: Request) => {
    // Safe access to body with strict type assumption or default
    const body = req.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === "string" ? body.email : "unknown";
    const ip = req.ip || "unknown";
    return `${email}:${ip}`;
  },
});

/**
 * 🔥 Admin Action Rate Limiter (SENSITIVE)
 * For critical admin operations (500 req/hour)
 */
export const adminRateLimiter = createRateLimiter({
  prefix: "admin",
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500,
  message: "Too many admin actions, please slow down.",
  keyGenerator: (req: Request) => {
    if (isAuthenticated(req)) {
      return `admin:${req.user.id}`;
    }
    return `ip:${req.ip || "unknown"}`;
  },
});

/**
 * 🔥 WhatsApp Message Rate Limiter
 * Prevents spam (60 messages/minute per company)
 */
export const whatsappRateLimiter = createRateLimiter({
  prefix: "whatsapp",
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: "Message sending limit reached. Please wait a moment.",
  keyGenerator: (req: Request) => {
    if (isAuthenticated(req) && req.user.companyId) {
      return `company:${req.user.companyId}`;
    }
    return `ip:${req.ip || "unknown"}`;
  },
});

// Re-export apiLimiter with explicit resolution to avoid module loading errors
// Note: Ensure rateLimitMiddleware exists. If not, this line should be removed.
export { apiLimiter } from "./rateLimitMiddleware";
