import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest } from "@/types/types";
import { flowService } from "@/services/FlowService";

/**
 *  FLOW CONTROLLER
 *
 * HTTP orchestrator for automation workflows.
 * All data access delegated to flowService (SRP).
 */

export const createFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const flow = await flowService.create(companyId, req.body as unknown as Parameters<typeof flowService.create>[1]);
    res.status(201).json(flow);
  },
);

export const getFlows = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(200).json([]);
    }

    const flows = await flowService.findAll(companyId);
    res.status(200).json(flows);
  },
);

export const getFlowById = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const flow = await flowService.findOne(id, companyId);

    if (!flow) {
      return next(new AppError("Flow not found", 404));
    }

    res.status(200).json(flow);
  },
);

export const getFlowStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const stats = await flowService.getStats(id, companyId);
    res.status(200).json(stats);
  },
);

export const updateFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const updatedFlow = await flowService.update(id, companyId, req.body as unknown as Parameters<typeof flowService.update>[2]);
    res.status(200).json(updatedFlow);
  },
);

export const deleteFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    await flowService.delete(id, companyId);
    res.status(204).send();
  },
);

export const toggleFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const updated = await flowService.toggle(id, companyId);
    res.status(200).json(updated);
  },
);

export const duplicateFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    const duplicate = await flowService.duplicate(id, companyId);
    res.status(201).json(duplicate);
  },
);
