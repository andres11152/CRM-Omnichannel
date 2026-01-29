import { Request, Response } from "express";
import { prisma } from "@/config/database";
import redisClient from "@/config/redis";
import { Logger } from "@/utils/logger";

/**
 * 🏥 COMPREHENSIVE HEALTH CHECK SYSTEM
 * Checks all critical services and returns detailed status
 */

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
 * 🏥 Detailed Health Check Endpoint
 */
export const healthCheckHandler = async (
  req: Request,
  res: Response
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
  const httpStatus =
    overallStatus === "healthy"
      ? 200
      : overallStatus === "degraded"
      ? 503
      : 503;

  res.status(httpStatus).json(result);
};

/**
 * 🔍 Check Database Connection
 */
async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    if (latency > 1000) {
      Logger.warn(`[Health] Database latency high: ${latency}ms`);
      return {
        status: "degraded",
        latency,
        message: "Database responding slowly",
      };
    }

    return {
      status: "up",
      latency,
    };
  } catch (error: any) {
    Logger.error("[Health] Database check failed:", error);
    return {
      status: "down",
      error: error.message,
      message: "Database connection failed",
    };
  }
}

/**
 * 🔍 Check Redis Connection
 */
async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    if (!redisClient || !redisClient.isOpen) {
      Logger.warn(
        "[Health] Redis client not connected - Running in fallback mode"
      );
      return {
        status: "degraded",
        message: "Redis unavailable - Using fallback mode",
      };
    }

    await redisClient.ping();
    const latency = Date.now() - start;

    if (latency > 500) {
      Logger.warn(`[Health] Redis latency high: ${latency}ms`);
      return {
        status: "degraded",
        latency,
        message: "Redis responding slowly",
      };
    }

    return {
      status: "up",
      latency,
    };
  } catch (error: any) {
    Logger.error("[Health] Redis check failed:", error);

    // Redis failure is not critical - we have fallback
    return {
      status: "degraded",
      error: error.message,
      message: "Redis connection failed - Using fallback mode",
    };
  }
}

/**
 * 🔍 Check Memory Usage
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
 * 🏥 Simple Liveness Probe (for Kubernetes)
 */
export const livenessProbe = (req: Request, res: Response): void => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
};

/**
 * 🏥 Readiness Probe (for Kubernetes)
 */
export const readinessProbe = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Check if critical services are ready
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      timestamp: new Date().toISOString(),
      error: "Database not ready",
    });
  }
};
