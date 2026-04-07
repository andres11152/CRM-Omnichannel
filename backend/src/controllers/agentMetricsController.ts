import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { agentMetricsService } from "@/services/AgentMetricsService";

/**
 * AGENT METRICS CONTROLLER
 *
 * HTTP orchestrator for agent performance metrics.
 * All data access delegated to agentMetricsService (SRP).
 */

/**
 * GET /api/users/metrics
 * Retorna métricas reales de todos los agentes del tenant
 */
export const getAgentMetrics = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      throw new AppError("Not authorized", 401);
    }

    const metrics = await agentMetricsService.getMetrics(companyId);

    res.status(200).json({
      status: "success",
      data: { metrics },
    });
  },
);
