import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Request } from "express";
import { AuthenticatedRequest } from "@/types/types";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 * [SEC] ENTERPRISE RATE LIMITER (MULTI-TENANT READY)
 * Uses Redis as a distributed store to ensure limits are shared across all app instances.
 */

// Custom key generator for IP-based rate limiting
const getClientIp = (req: Request): string => {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"
  );
};

// Distributed Store Setup (Redis v4+ compatible)
const createStore = (prefix: string) => {
  if (!redisClient) {
    Logger.warn(`[RateLimit] [WARN] Redis not found. Falling back to Memory Store for ${prefix}`);
    return undefined; // Falls back to express-rate-limit default memory store
  }

  return new RedisStore({
    sendCommand: async (...args: string[]): Promise<string | number | null> => {
      if (!redisClient?.isReady) {
        // [SEC] Prevent crash during library init scripts (SHA detection)
        if (args[0]?.toUpperCase() === "SCRIPT") return "DUMMY_SHA";
        return null;
      }
      const result = await redisClient.sendCommand(args);
      return result as string | number;
    },
    prefix: `rl:${prefix}:`,
  });
};


const tenantKeyGenerator = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;
  const companyId = authReq.user?.companyId;

  // [SaaS] Scope by Company + User if authenticated
  if (companyId && userId) {
    return `c:${companyId}:u:${userId}`;
  }
  
  // Scope by Company only if identified (e.g., from subdomain or header)
  if (companyId) {
    return `c:${companyId}:ip:${getClientIp(req)}`;
  }

  // Fallback to IP for public routes
  return `ip:${getClientIp(req)}`;
};

/**
 * Global API Limiter
 * 600 requests per minute per tenant/user (Distributed)
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600, 
  keyGenerator: tenantKeyGenerator,
  store: createStore("api"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    message: "[SEC] [LIMIT] Demasiadas peticiones. Intente de nuevo en 1 minuto.",
  },
});

/**
 * High-Burst Webhook Limiter
 * 3000 requests per minute (Distributed)
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3000,
  keyGenerator: getClientIp,
  store: createStore("webhook"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Webhook rate limit exceeded" },
});

/**
 * Auth/Security Limiter (Brute Force Protection)
 * 10 attempts per minute per IP (Distributed)
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: getClientIp,
  store: createStore("auth"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    message: "[SEC] [AUTH] Demasiados intentos. Bloqueo preventivo por 1 minuto.",
  },
});
