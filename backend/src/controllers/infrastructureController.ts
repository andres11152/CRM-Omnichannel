import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { infrastructureService } from "@/services/admin/InfrastructureService";
import { catchAsync } from "@/utils/catchAsync";
import { Logger } from "@/utils/logger";

/**
 * Controller for Deep Infrastructure Monitoring (Master Only)
 */
export const getInfrastructureHealth = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    Logger.info(`[InfrastructureController] Master auditing system health [User: ${req.user?.email}]`);
    
    const stats = await infrastructureService.getDeepHealth();
    
    res.json(stats);
  }
);
