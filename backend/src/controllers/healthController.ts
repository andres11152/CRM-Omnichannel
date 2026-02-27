import { Request, Response } from "express";
import { healthRepository } from "@/repositories/HealthRepository";
import redisClient from "@/config/redis";
import { HealthStatus, ServiceHealth, MemoryHealth } from "@/types/health";

/**
 * 🛡️ HEALTH CHECK ENDPOINT
 *
 * Returns the health status of all critical services.
 * Used by load balancers, monitoring systems, and orchestrators (K8s, Docker Swarm).
 *
 * Response codes:
 * - 200: All systems operational
 * - 503: One or more critical services are down
 */

export const healthCheck = async (req: Request, res: Response) => {
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      memory: checkMemory(),
    },
  };

  // Determine overall health
  const hasDownService = Object.values(health.services).some(
    (service) => service.status === "down" || service.status === "critical",
  );

  if (hasDownService) {
    health.status = "unhealthy";
    return res.status(503).json(health);
  }

  const hasDegradedService = Object.values(health.services).some(
    (service) => service.status === "warning",
  );

  if (hasDegradedService) {
    health.status = "degraded";
  }

  res.status(200).json(health);
};

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await healthRepository.checkDatabaseLiveness();
    return {
      status: "up",
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "down",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    if (!redisClient || !redisClient.isOpen) {
      return { status: "down", error: "Redis client not connected" };
    }

    await redisClient.ping();
    return {
      status: "up",
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "down",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkMemory(): MemoryHealth {
  const usage = process.memoryUsage();
  const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const percentUsed = Math.round((usedMB / totalMB) * 100);

  let status: "ok" | "warning" | "critical" = "ok";
  if (percentUsed > 90) status = "critical";
  else if (percentUsed > 75) status = "warning";

  return {
    status,
    usedMB,
    totalMB,
    percentUsed,
  };
}

/**
 * 🛡️ READINESS CHECK
 *
 * Simpler check for container orchestrators.
 * Returns 200 if the service can accept traffic.
 */
export const readinessCheck = async (req: Request, res: Response) => {
  try {
    // Quick database ping
    await healthRepository.checkDatabaseLiveness();
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
};

/**
 * 🛡️ LIVENESS CHECK
 *
 * Simplest check - just confirms the process is running.
 * Used by orchestrators to detect if the process needs to be restarted.
 */
export const livenessCheck = (req: Request, res: Response) => {
  res.status(200).json({ alive: true });
};
