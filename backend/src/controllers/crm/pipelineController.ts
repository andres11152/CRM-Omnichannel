import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { pipelineService } from "../../services/pipelineService";
import {
  CreatePipelineBodySchema,
  UpdatePipelineBodySchema,
  DuplicatePipelineBodySchema,
  PipelineParamsSchema,
} from "../../schemas/pipeline.schema";

export const getPipelines = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    const pipelines = await pipelineService.getPipelines(companyId);

    console.log(
      `[DEBUG] getPipelines for company ${companyId}: Found ${pipelines.length}`,
    );

    res.status(200).json({
      status: "success",
      results: pipelines.length,
      data: { pipelines },
    });
  },
);

export const getPipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = PipelineParamsSchema.parse(req.params);
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    const pipeline = await pipelineService.getPipeline(id, companyId);

    res.status(200).json({
      status: "success",
      data: { pipeline },
    });
  },
);

export const createPipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    // Validate body
    const body = CreatePipelineBodySchema.parse(req.body);

    const pipeline = await pipelineService.createPipeline(companyId, body);

    res.status(201).json({
      status: "success",
      data: { pipeline },
    });
  },
);

export const updatePipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = PipelineParamsSchema.parse(req.params);
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    // Validate body (partial)
    const body = UpdatePipelineBodySchema.parse(req.body);

    const pipeline = await pipelineService.updatePipeline(id, companyId, body);

    res.status(200).json({
      status: "success",
      data: { pipeline },
    });
  },
);

export const deletePipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = PipelineParamsSchema.parse(req.params);
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    await pipelineService.deletePipeline(id, companyId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);

export const duplicatePipeline = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = PipelineParamsSchema.parse(req.params);
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    // Validate body (name is optional)
    const body = DuplicatePipelineBodySchema.parse(req.body);

    const pipeline = await pipelineService.duplicatePipeline(
      id,
      companyId,
      body.name,
    );

    res.status(201).json({
      status: "success",
      data: { pipeline },
    });
  },
);
