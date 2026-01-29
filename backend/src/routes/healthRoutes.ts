import { Router } from "express";
import {
  healthCheck,
  readinessCheck,
  livenessCheck,
} from "@/controllers/healthController";

const router = Router();

/**
 * 🛡️ HEALTH CHECK ROUTES
 *
 * These endpoints are critical for production deployments:
 * - /health: Comprehensive health status (for monitoring dashboards)
 * - /health/ready: Kubernetes readiness probe
 * - /health/live: Kubernetes liveness probe
 */

// Comprehensive health check
router.get("/", healthCheck);

// Kubernetes/Docker probes
router.get("/ready", readinessCheck);
router.get("/live", livenessCheck);

export default router;
