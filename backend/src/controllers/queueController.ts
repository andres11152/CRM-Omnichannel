import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types";
import { prisma } from "@/config/database";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { Prisma } from "@prisma/client";

export const createQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // req.body is already validated by CreateQueueSchema middleware
    const data = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const queue = await prisma.queue.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        config: data.config,
        isActive: data.isActive,
        companyId,
        departmentId: data.departmentId || null,
        aiAssistantId: data.aiAssistantId || null,
      },
    });

    res.status(201).json(queue);
  },
);

export const getQueues = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const queues = await prisma.queue.findMany({
      where: { companyId },
      include: {
        department: true,
        aiAssistant: true,
        _count: {
          select: { tickets: true, agents: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(queues);
  },
);

export const updateQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Both Params and Body are validated by UpdateQueueSchema
    const { id } = req.params;
    const data = req.body;
    const companyId = req.companyId || req.user?.companyId;

    const queue = await prisma.queue.findFirst({
      where: { id, companyId },
    });

    if (!queue) {
      return next(new AppError("Queue not found", 404));
    }

    const updateData: Prisma.QueueUncheckedUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.config !== undefined)
      updateData.config = data.config ?? Prisma.JsonNull;
    if (data.departmentId !== undefined)
      updateData.departmentId = data.departmentId;
    if (data.aiAssistantId !== undefined)
      updateData.aiAssistantId = data.aiAssistantId;

    const updatedQueue = await prisma.queue.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json(updatedQueue);
  },
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
  },
);
