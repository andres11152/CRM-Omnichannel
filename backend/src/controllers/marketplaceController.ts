import { Response } from "express";
import { AuthenticatedRequest } from "@/types/types";
import { marketplaceService } from "@/services/admin/MarketplaceService";
import { catchAsync } from "@/utils/catchAsync";
import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";

export const getGlobalInventory = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const inventory = await marketplaceService.getGlobalInventory();
    res.json(inventory);
  }
);

export const toggleTemplateGlobal = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { templateId } = req.params;
    const { isGlobal } = req.body;

    if (!templateId) throw new AppError("ID de plantilla requerido", 400);

    const updated = await marketplaceService.toggleTemplateGlobal(templateId, isGlobal);
    res.json(updated);
  }
);

export const toggleWorkflowGlobal = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { workflowId } = req.params;
    const { isGlobal } = req.body;

    if (!workflowId) throw new AppError("ID de flujo requerido", 400);

    const updated = await marketplaceService.toggleWorkflowGlobal(workflowId, isGlobal);
    res.json(updated);
  }
);

export const manualDistribute = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) throw new AppError("ID de empresa requerido", 400);

    const result = await marketplaceService.distributeToCompany(companyId);
    res.json({ message: "Distribución completada", result });
  }
);
