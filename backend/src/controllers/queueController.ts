import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { queueService } from "@/services/queueService";

export const createQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const data = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID not found", 400));

    const queue = await queueService.create(companyId, data);
    res.status(201).json(queue);
  },
);

export const getQueues = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID not found", 400));

    const queues = await queueService.findAll(companyId);
    res.status(200).json(queues);
  },
);

export const updateQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const data = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID not found", 400));

    const updatedQueue = await queueService.update(id, companyId, data);
    res.status(200).json(updatedQueue);
  },
);

export const deleteQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID not found", 400));

    await queueService.delete(id, companyId);
    res.status(204).send();
  },
);
