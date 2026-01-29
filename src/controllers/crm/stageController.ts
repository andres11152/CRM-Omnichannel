import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/database";

// Get all stages for a pipeline
export const getStages = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId } = req.params;
    const companyId = req.user?.companyId;

    // Verify pipeline belongs to company
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    const stages = await prisma.stage.findMany({
      where: { pipelineId },
      include: {
        _count: {
          select: { deals: true },
        },
      },
      orderBy: { order: "asc" },
    });

    res.status(200).json({
      status: "success",
      results: stages.length,
      data: { stages },
    });
  }
);

// Create new stage in a pipeline
export const createStage = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId } = req.params;
    const companyId = req.user?.companyId;
    const { name, color, order } = req.body;

    if (!name) {
      return next(new AppError("Stage name is required", 400));
    }

    // Verify pipeline belongs to company
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    // If order not provided, add to end
    let stageOrder = order;
    if (stageOrder === undefined) {
      const maxOrder = await prisma.stage.aggregate({
        where: { pipelineId },
        _max: { order: true },
      });
      stageOrder = (maxOrder._max.order || 0) + 1;
    }

    const stage = await prisma.stage.create({
      data: {
        pipelineId,
        name,
        color: color || "#6B7280",
        order: stageOrder,
      },
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });

    res.status(201).json({
      status: "success",
      data: { stage },
    });
  }
);

// Update stage
export const updateStage = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId, id } = req.params;
    const companyId = req.user?.companyId;
    const { name, color, order } = req.body;

    // Verify pipeline belongs to company
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    // Verify stage belongs to pipeline
    const stage = await prisma.stage.findFirst({
      where: { id, pipelineId },
    });

    if (!stage) {
      return next(new AppError("Stage not found", 404));
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (color !== undefined) updateData.color = color;
    if (order !== undefined) updateData.order = order;

    const updatedStage = await prisma.stage.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });

    res.status(200).json({
      status: "success",
      data: { stage: updatedStage },
    });
  }
);

// Reorder stages (batch update)
export const reorderStages = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId } = req.params;
    const companyId = req.user?.companyId;
    const { stages } = req.body; // Array of { id, order }

    if (!stages || !Array.isArray(stages)) {
      return next(new AppError("Stages array is required", 400));
    }

    // Verify pipeline belongs to company
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    // Update all stages in a transaction
    const updatePromises = stages.map((stageUpdate: any) =>
      prisma.stage.updateMany({
        where: { id: stageUpdate.id, pipelineId },
        data: { order: stageUpdate.order },
      })
    );

    await prisma.$transaction(updatePromises);

    // Fetch updated stages
    const updatedStages = await prisma.stage.findMany({
      where: { pipelineId },
      orderBy: { order: "asc" },
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });

    res.status(200).json({
      status: "success",
      data: { stages: updatedStages },
    });
  }
);

// Delete stage
export const deleteStage = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId, id } = req.params;
    const companyId = req.user?.companyId;

    // Verify pipeline belongs to company
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    // Verify stage belongs to pipeline
    const stage = await prisma.stage.findFirst({
      where: { id, pipelineId },
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });

    if (!stage) {
      return next(new AppError("Stage not found", 404));
    }

    // Prevent deletion if stage has deals
    if (stage._count.deals > 0) {
      return next(
        new AppError(
          `Cannot delete stage with ${stage._count.deals} active deals. Move deals first.`,
          400
        )
      );
    }

    // Prevent deletion if it's the only stage
    const stageCount = await prisma.stage.count({
      where: { pipelineId },
    });

    if (stageCount <= 1) {
      return next(
        new AppError("Cannot delete the only stage in the pipeline", 400)
      );
    }

    await prisma.stage.delete({ where: { id } });

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);
