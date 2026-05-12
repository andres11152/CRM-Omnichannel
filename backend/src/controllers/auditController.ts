import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { auditService } from "@/services/AuditService";
import { catchAsync } from "@/utils/catchAsync";
import { Logger } from "@/utils/logger";

/**
 * Controller for Master Audit Log (Forensics)
 */
export const getGlobalAuditLogs = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { 
      companyId, 
      userId, 
      entity, 
      action, 
      startDate, 
      endDate, 
      limit, 
      offset 
    } = req.query;

    Logger.info(`[AuditController] Master fetching global logs [User: ${req.user?.email}]`);

    const logs = await auditService.getGlobalForensics({
      companyId: companyId as string,
      userId: userId as string,
      entity: entity as string,
      action: action as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json(logs);
  }
);
