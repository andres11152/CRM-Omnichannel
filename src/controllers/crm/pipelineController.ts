import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/prisma";

// Get all pipelines for a company
export const getPipelines = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const pipelines = await prisma.pipeline.findMany({
      where: { companyId },
      include: {
        stages: {
          orderBy: { order: "asc" },
        },
        _count: {
          select: { deals: true },
        },
      },
      orderBy: [
        { isDefault: "desc" }, // Default pipeline first
        { createdAt: "asc" },
      ],
    });

    res.status(200).json({
      status: "success",
      results: pipelines.length,
      data: { pipelines },
    });
  }
);

// Get single pipeline with stages and deals
export const getPipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const pipeline = await prisma.pipeline.findFirst({
      where: { id, companyId },
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: {
            deals: {
              orderBy: { order: "asc" },
              include: {
                account: { select: { name: true } },
                contact: { select: { name: true, email: true } },
                assignedTo: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: { pipeline },
    });
  }
);

// Create new pipeline
export const createPipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const { name, isDefault, stages } = req.body;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    if (!name) {
      return next(new AppError("Pipeline name is required", 400));
    }

    // If setting as default, remove default from other pipelines
    if (isDefault) {
      await prisma.pipeline.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Create pipeline
    const pipeline = await prisma.pipeline.create({
      data: {
        companyId,
        name,
        isDefault: isDefault || false,
      },
    });

    // Create stages if provided
    if (stages && Array.isArray(stages)) {
      const stagePromises = stages.map((stage: any, index: number) =>
        prisma.stage.create({
          data: {
            pipelineId: pipeline.id,
            name: stage.name,
            order: stage.order !== undefined ? stage.order : index,
            color: stage.color || "#6B7280",
          },
        })
      );

      await Promise.all(stagePromises);
    } else {
      // Create default stages
      const defaultStages = [
        { name: "Nuevo", order: 0, color: "#3B82F6" },
        { name: "Calificado", order: 1, color: "#8B5CF6" },
        { name: "Propuesta", order: 2, color: "#F59E0B" },
        { name: "Negociación", order: 3, color: "#EC4899" },
        { name: "Ganado", order: 4, color: "#10B981" },
        { name: "Perdido", order: 5, color: "#EF4444" },
      ];

      const stagePromises = defaultStages.map((stage) =>
        prisma.stage.create({
          data: {
            pipelineId: pipeline.id,
            ...stage,
          },
        })
      );

      await Promise.all(stagePromises);
    }

    // Fetch complete pipeline with stages
    const completePipeline = await prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: {
        stages: { orderBy: { order: "asc" } },
      },
    });

    res.status(201).json({
      status: "success",
      data: { pipeline: completePipeline },
    });
  }
);

// Update pipeline
export const updatePipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;
    const { name, isDefault } = req.body;

    const pipeline = await prisma.pipeline.findFirst({
      where: { id, companyId },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    // If setting as default, remove default from other pipelines
    if (isDefault && !pipeline.isDefault) {
      await prisma.pipeline.updateMany({
        where: { companyId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updatedPipeline = await prisma.pipeline.update({
      where: { id },
      data: {
        name: name || pipeline.name,
        isDefault: isDefault !== undefined ? isDefault : pipeline.isDefault,
      },
      include: {
        stages: { orderBy: { order: "asc" } },
      },
    });

    res.status(200).json({
      status: "success",
      data: { pipeline: updatedPipeline },
    });
  }
);

// Delete pipeline
export const deletePipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const pipeline = await prisma.pipeline.findFirst({
      where: { id, companyId },
      include: {
        _count: {
          select: { deals: true },
        },
      },
    });

    if (!pipeline) {
      return next(new AppError("Pipeline not found", 404));
    }

    // Prevent deletion if pipeline has deals
    if (pipeline._count.deals > 0) {
      return next(
        new AppError(
          `Cannot delete pipeline with ${pipeline._count.deals} active deals. Move or delete deals first.`,
          400
        )
      );
    }

    // Prevent deletion of default pipeline if it's the only one
    if (pipeline.isDefault) {
      const otherPipelines = await prisma.pipeline.count({
        where: { companyId, id: { not: id } },
      });

      if (otherPipelines === 0) {
        return next(
          new AppError(
            "Cannot delete the only pipeline. Create another one first.",
            400
          )
        );
      }
    }

    await prisma.pipeline.delete({ where: { id } });

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);

// Duplicate pipeline
export const duplicatePipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;
    const { name } = req.body;

    const sourcePipeline = await prisma.pipeline.findFirst({
      where: { id, companyId },
      include: {
        stages: { orderBy: { order: "asc" } },
      },
    });

    if (!sourcePipeline) {
      return next(new AppError("Source pipeline not found", 404));
    }

    // Create duplicate pipeline
    const newPipeline = await prisma.pipeline.create({
      data: {
        companyId,
        name: name || `${sourcePipeline.name} (Copy)`,
        isDefault: false, // Duplicates are never default
      },
    });

    // Duplicate stages
    const stagePromises = sourcePipeline.stages.map((stage) =>
      prisma.stage.create({
        data: {
          pipelineId: newPipeline.id,
          name: stage.name,
          order: stage.order,
          color: stage.color,
        },
      })
    );

    await Promise.all(stagePromises);

    // Fetch complete duplicated pipeline
    const completePipeline = await prisma.pipeline.findUnique({
      where: { id: newPipeline.id },
      include: {
        stages: { orderBy: { order: "asc" } },
      },
    });

    res.status(201).json({
      status: "success",
      data: { pipeline: completePipeline },
    });
  }
);
