import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { stageService } from "../../services/stageService";
import {
  CreateStageBodySchema,
  UpdateStageBodySchema,
  ReorderStagesBodySchema,
  StageParamsSchema,
  ReorderStagesInput,
} from "../../schemas/pipeline.schema";

export const getStages = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Only pipelineId in params
    const { pipelineId } = StageParamsSchema.pick({
      pipelineId: true,
    }).parse(req.params);

    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    const stages = await stageService.getStages(pipelineId, companyId);

    res.status(200).json({
      status: "success",
      results: stages.length,
      data: { stages },
    });
  },
);

export const createStage = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId } = StageParamsSchema.pick({
      pipelineId: true,
    }).parse(req.params);

    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    // Validate body
    const body = CreateStageBodySchema.parse(req.body);

    const stage = await stageService.createStage(pipelineId, companyId, body);

    res.status(201).json({
      status: "success",
      data: { stage },
    });
  },
);

export const updateStage = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId, id } = StageParamsSchema.parse(req.params);

    if (!id) return next(new AppError("Stage ID is required", 400));

    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    // Validate body
    const body = UpdateStageBodySchema.parse(req.body);

    const stage = await stageService.updateStage(
      pipelineId,
      id,
      companyId,
      body,
    );

    res.status(200).json({
      status: "success",
      data: { stage },
    });
  },
);

export const reorderStages = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId } = StageParamsSchema.pick({
      pipelineId: true,
    }).parse(req.params);

    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    // Validate body
    const body = ReorderStagesBodySchema.parse(req.body) as ReorderStagesInput;

    const updatedStages = await stageService.reorderStages(
      pipelineId,
      companyId,
      body.stages as { id: string; order: number }[],
    );

    res.status(200).json({
      status: "success",
      data: { stages: updatedStages },
    });
  },
);

export const deleteStage = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { pipelineId, id } = StageParamsSchema.parse(req.params);

    if (!id) return next(new AppError("Stage ID is required", 400));

    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    await stageService.deleteStage(pipelineId, id, companyId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);
