import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { createClient } from "redis";
import { Request, Response } from "express";
import { Logger } from "@/utils/logger";

/**
 * DISTRIBUTED RATE LIMITER WITH REDIS
 *
 * BEFORE (BROKEN):
 * - In-memory rate limiting (breaks with multiple instances)
 * - No distributed state
 * - Horizontal scaling impossible
 *
 * AFTER (PRODUCTION):
 * - Redis-backed rate limiting
 * - Distributed across all server instances
 * - Scalable horizontally
 * - Per-IP and per-user limits
 */

// Create Redis client for rate limiting
const rateLimitRedis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        Logger.error("[RateLimit] Redis reconnection failed");
        return new Error("Redis reconnection limit exceeded");
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

rateLimitRedis.on("error", (err) => {
  Logger.error("[RateLimit] Redis Client Error:", err);
});

rateLimitRedis.on("connect", () => {
  Logger.info("[RateLimit] Redis connected for rate limiting");
});

// Initialize connection
(async () => {
  try {
    await rateLimitRedis.connect();
  } catch (error) {
    Logger.error("[RateLimit] Failed to connect to Redis:", error);
  }
})();

/**
 * Helper to extract user ID from request
 */
const getUserKey = (req: Request): string => {
  return req.user?.id || req.ip || "anonymous";
};

/**
 * Custom key generator for user-based rate limiting
 */
const userKeyGenerator = (req: Request): string => {
  return `ratelimit:user:${getUserKey(req)}`;
};

/**
 * Custom key generator for IP-based rate limiting
 */
const ipKeyGenerator = (req: Request): string => {
  return `ratelimit:ip:${req.ip}`;
};

/**
 * Standard error handler
 */
const standardHandler = (req: Request, res: Response) => {
  res.status(429).json({
    status: "error",
    message: "Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.",
    retryAfter: res.getHeader("Retry-After"),
  });
};

/**
 * Strict auth rate limiter (for login/signup)
 * 5 requests per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are outdated - RedisStore types are outdated
    client: rateLimitRedis,
    prefix: "ratelimit:auth:",
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message:
    "Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: standardHandler,
  keyGenerator: ipKeyGenerator,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health" || req.path === "/api/health";
  },
});

/**
 * API rate limiter (for general API endpoints)
 * 100 requests per 15 minutes per user
 */
export const apiRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are outdated
    client: rateLimitRedis,
    prefix: "ratelimit:api:",
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each user to 100 requests per window
  message:
    "Demasiadas solicitudes. Por favor, reduce la frecuencia de tus peticiones.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler,
  keyGenerator: userKeyGenerator,
  skip: (req) => {
    return req.path === "/health" || req.path === "/api/health";
  },
});

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per hour per user
 */
export const strictRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are outdated
    client: rateLimitRedis,
    prefix: "ratelimit:strict:",
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each user to 10 requests per hour
  message:
    "Has excedido el límite de solicitudes para esta operación sensible.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler,
  keyGenerator: userKeyGenerator,
});

/**
 * Generous rate limiter for public endpoints
 * 1000 requests per hour per IP
 */
export const publicRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are outdated
    client: rateLimitRedis,
    prefix: "ratelimit:public:",
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // 1000 requests per hour
  message: "Demasiadas solicitudes públicas.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler,
  keyGenerator: ipKeyGenerator,
  skip: (req) => {
    return req.path === "/health" || req.path === "/api/health";
  },
});

/**
 * Webhook rate limiter (for external webhooks)
 * 500 requests per minute per IP
 */
export const webhookRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are outdated
    client: rateLimitRedis,
    prefix: "ratelimit:webhook:",
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 500,
  message: "Webhook rate limit exceeded",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});

/**
 * Admin operations rate limiter
 * 50 requests per hour
 */
export const adminRateLimiter = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - RedisStore types are outdated
    client: rateLimitRedis,
    prefix: "ratelimit:admin:",
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: "Límite de operaciones administrativas alcanzado.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
});

// Export Redis client for cleanup
export { rateLimitRedis };
