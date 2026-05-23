import { Request, Response } from "express";
import { prisma } from "@/config/database";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 *  COMPREHENSIVE HEALTH CHECK SYSTEM
 * Checks all critical services and returns detailed status.
 *
 * [SEC] PERFORMANCE: DB and Redis checks are cached for HEALTH_CACHE_TTL_MS
 * to prevent connection pool exhaustion under concurrent load (e.g., K8s probes,
 * load balancers, or stress tests hitting /health simultaneously).
 */

const HEALTH_CACHE_TTL_MS = 3000; // 3 seconds

interface CachedResult<T> {
  data: T;
  expiresAt: number;
}

let dbCache: CachedResult<ServiceStatus> | null = null;
let redisCache: CachedResult<ServiceStatus> | null = null;

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  services: {
    api: ServiceStatus;
    database: ServiceStatus;
    redis: ServiceStatus;
    memory: MemoryStatus;
  };
  metrics?: {
    totalRequests?: number;
    activeConnections?: number;
  };
}

interface ServiceStatus {
  status: "up" | "down" | "degraded";
  latency?: number;
  message?: string;
  error?: string;
}

interface MemoryStatus extends ServiceStatus {
  heapUsed: number;
  heapTotal: number;
  heapUsedPercent: number;
  rss: number;
  external: number;
}

/**
 *  Detailed Health Check Endpoint
 */
export const healthCheckHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const startTime = Date.now();
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  // 1. API Status (always up if we reach here)
  const apiStatus: ServiceStatus = {
    status: "up",
    latency: Date.now() - startTime,
  };

  // 2. Database Health
  const dbStatus = await checkDatabase();
  if (dbStatus.status === "down") overallStatus = "unhealthy";
  if (dbStatus.status === "degraded") overallStatus = "degraded";

  // 3. Redis Health
  const redisStatus = await checkRedis();
  if (redisStatus.status === "down") {
    // Redis down is degraded, not unhealthy (we have fallback)
    if (overallStatus !== "unhealthy") overallStatus = "degraded";
  }

  // 4. Memory Health
  const memoryStatus = checkMemory();
  if (memoryStatus.heapUsedPercent > 90) {
    Logger.error("[Health] CRITICAL: Memory usage above 90%");
    overallStatus = "unhealthy";
  } else if (memoryStatus.heapUsedPercent > 75) {
    Logger.warn("[Health] WARNING: Memory usage above 75%");
    if (overallStatus === "healthy") overallStatus = "degraded";
  }

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      api: apiStatus,
      database: dbStatus,
      redis: redisStatus,
      memory: memoryStatus,
    },
  };

  // Set appropriate HTTP status code
  // [SEC] FIX: "degraded" means the service works but with warnings — NOT a 503.
  // Only "unhealthy" should return 503 (Service Unavailable).
  const httpStatus = overallStatus === "unhealthy" ? 503 : 200;

  res.status(httpStatus).json(result);
};

/**
 * [SEARCH] Check Database Connection (with TTL cache)
 * Prevents connection pool exhaustion under concurrent health probes.
 */
async function checkDatabase(): Promise<ServiceStatus> {
  // Return cached result if still valid
  if (dbCache && Date.now() < dbCache.expiresAt) {
    return dbCache.data;
  }

  const start = Date.now();
  try {
    const dbPromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database check timeout")), 5000)
    );
    await Promise.race([dbPromise, timeoutPromise]);
    const latency = Date.now() - start;

    let result: ServiceStatus;
    if (latency > 1000) {
      Logger.warn(`[Health] Database latency high: ${latency}ms`);
      result = {
        status: "degraded",
        latency,
        message: "Database responding slowly",
      };
    } else {
      result = { status: "up", latency };
    }

    dbCache = { data: result, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS };
    return result;
  } catch (error: unknown) {
    Logger.error("[Health] Database check failed:", error);
    const result: ServiceStatus = {
      status: "down",
      error: error instanceof Error ? error.message : String(error),
      message: "Database connection failed",
    };
    // Cache failures for a shorter TTL to retry sooner
    dbCache = { data: result, expiresAt: Date.now() + 1000 };
    return result;
  }
}

/**
 * [SEARCH] Check Redis Connection (with TTL cache)
 * Prevents Redis ping flood under concurrent health probes.
 */
async function checkRedis(): Promise<ServiceStatus> {
  // Return cached result if still valid
  if (redisCache && Date.now() < redisCache.expiresAt) {
    return redisCache.data;
  }

  const start = Date.now();
  try {
    if (!redisClient || !redisClient.isOpen) {
      Logger.warn(
        "[Health] Redis client not connected - Running in fallback mode",
      );
      const result: ServiceStatus = {
        status: "degraded",
        message: "Redis unavailable - Using fallback mode",
      };
      redisCache = {
        data: result,
        expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
      };
      return result;
    }

    const pingPromise = redisClient.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Redis ping timeout")), 5000)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    const latency = Date.now() - start;

    let result: ServiceStatus;
    if (latency > 500) {
      Logger.warn(`[Health] Redis latency high: ${latency}ms`);
      result = {
        status: "degraded",
        latency,
        message: "Redis responding slowly",
      };
    } else {
      result = { status: "up", latency };
    }

    redisCache = { data: result, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS };
    return result;
  } catch (error: unknown) {
    Logger.error("[Health] Redis check failed:", error);
    const result: ServiceStatus = {
      status: "degraded",
      error: error instanceof Error ? error.message : String(error),
      message: "Redis connection failed - Using fallback mode",
    };
    redisCache = { data: result, expiresAt: Date.now() + 1000 };
    return result;
  }
}

/**
 * [SEARCH] Check Memory Usage
 */
function checkMemory(): MemoryStatus {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

  const status: "up" | "degraded" | "down" =
    heapUsedPercent > 90 ? "down" : heapUsedPercent > 75 ? "degraded" : "up";

  return {
    status,
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    heapUsedPercent: Math.round(heapUsedPercent),
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
}

/**
 *  Simple Liveness Probe (for Kubernetes)
 */
export const livenessProbe = (req: Request, res: Response): void => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
};

/**
 *  Readiness Probe (for Kubernetes)
 * Uses the cached DB check to avoid pool exhaustion.
 */
export const readinessProbe = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const dbStatus = await checkDatabase();
    if (dbStatus.status === "down") {
      res.status(503).json({
        status: "not_ready",
        timestamp: new Date().toISOString(),
        error: dbStatus.error || "Database not ready",
      });
      return;
    }

    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
      dbLatency: dbStatus.latency,
    });
  } catch {
    res.status(503).json({
      status: "not_ready",
      timestamp: new Date().toISOString(),
      error: "Database not ready",
    });
  }
};
