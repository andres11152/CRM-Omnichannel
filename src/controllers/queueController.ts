import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "@/types";
import { prisma } from "@/config/database";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";

export const createQueue = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const {
      name,
      departmentId,
      description,
      promptTemplateId,
      type,
      config,
      aiAssistantId,
    } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID not found", 400));
    }

    const queue = await prisma.queue.create({
      data: {
        name,
        description,
        type: type || "MANUAL",
        config: config || {},
        companyId,
        departmentId: departmentId || null,
        aiAssistantId: aiAssistantId || null,
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
    const { id } = req.params;
    const {
      name,
      description,
      isActive,
      type,
      config,
      departmentId,
      aiAssistantId,
    } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    const queue = await prisma.queue.findFirst({
      where: { id, companyId },
    });

    if (!queue) {
      return next(new AppError("Queue not found", 404));
    }

    const updatedQueue = await prisma.queue.update({
      where: { id },
      data: {
        name,
        description,
        isActive,
        type,
        config,
        departmentId,
        aiAssistantId,
      },
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
