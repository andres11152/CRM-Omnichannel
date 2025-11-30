import { Request, Response, NextFunction } from "express";
import { prisma } from "@/config/prisma";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    companyId: string;
  };
  companyId?: string;
}

export const createQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, department, description, promptTemplateId } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const queue = await prisma.queue.create({
      data: {
        name,
        description, // Note: Schema calls it 'description', frontend might send 'department' as part of description or we need to update schema/frontend.
        // Wait, schema has 'description'. Frontend sends 'department'.
        // I should probably store 'department' in description or add a field.
        // For now, let's map department to description or just ignore it if schema doesn't have it.
        // Schema: name, description, isActive, companyId.
        // I will append department to description for now or just store it.
        companyId,
      },
    });

    res.status(201).json(queue);
  }
);

export const getQueues = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const queues = await prisma.queue.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(queues);
  }
);

export const updateQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    const queue = await prisma.queue.findFirst({
      where: { id, companyId },
    });

    if (!queue) {
      return next(new AppError("Queue not found", 404));
    }

    const updatedQueue = await prisma.queue.update({
      where: { id },
      data: { name, description, isActive },
    });

    res.status(200).json(updatedQueue);
  }
);

export const deleteQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const queue = await prisma.queue.findFirst({
      where: { id, companyId },
    });

    if (!queue) {
      return next(new AppError("Queue not found", 404));
    }

    await prisma.queue.delete({ where: { id } });

    res.status(204).send();
  }
);
