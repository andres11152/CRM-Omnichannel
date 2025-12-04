import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";

export const createFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { name, triggerType, triggerConfig, nodes, edges, isActive } =
      req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID missing", 400));
    }

    try {
      // Use Prisma Client instead of raw SQL
      const flow = await prisma.workflow.create({
        data: {
          companyId,
          name,
          triggerType: triggerType || "KEYWORD",
          triggerConfig: triggerConfig || {},
          nodes: nodes || [],
          edges: edges || [],
          isActive: isActive !== undefined ? isActive : true,
        },
      });

      res.status(201).json(flow);
    } catch (error) {
      console.error("Error creating flow:", error);
      return next(new AppError("Failed to create flow", 500));
    }
  }
);

export const getFlows = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(200).json([]);
    }

    try {
      const flows = await prisma.workflow.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });
      res.status(200).json(flows);
    } catch (error) {
      console.error("Error fetching flows:", error);
      return next(new AppError("Failed to fetch flows", 500));
    }
  }
);

export const updateFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const data = req.body;

    // Verify ownership
    const existing = await prisma.workflow.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return next(new AppError("Flow not found", 404));
    }

    try {
      const updatedFlow = await prisma.workflow.update({
        where: { id },
        data: {
          name: data.name,
          triggerType: data.triggerType,
          triggerConfig: data.triggerConfig,
          nodes: data.nodes,
          edges: data.edges,
          isActive: data.isActive,
        },
      });

      res.status(200).json(updatedFlow);
    } catch (error) {
      console.error("Error updating flow:", error);
      return next(new AppError("Failed to update flow", 500));
    }
  }
);

export const deleteFlow = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const existing = await prisma.workflow.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      return next(new AppError("Flow not found", 404));
    }

    try {
      await prisma.workflow.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting flow:", error);
      return next(new AppError("Failed to delete flow", 500));
    }
  }
);
