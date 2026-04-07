import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { dealService } from "../../services/DealService";
import { Logger } from "../../utils/logger";
import {
  CreateDealSchema,
  UpdateDealSchema,
  UpdateDealOrderSchema,
  GetDealsSchema,
  GetDealSchema,
  DeleteDealSchema,
} from "../../schemas/dealSchema";

export const getDeals = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    Logger.debug("Entered getDeals controller", {
      query: req.query as Record<string, unknown>,
    });
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    const { query } = GetDealsSchema.parse({ query: req.query });

    const deals = await dealService.getDeals(companyId, {
      pipelineId: query.pipelineId,
      stageId: query.stageId,
      accountId: query.accountId,
      contactId: query.contactId,
    });

    Logger.debug("Service returned deals", { count: deals.length });

    res.status(200).json({
      status: "success",
      results: deals.length,
      data: { deals },
    });
  },
);

export const getDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { params } = GetDealSchema.parse({ params: req.params });
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    const deal = await dealService.getDeal(params.id, companyId);

    res.status(200).json({
      status: "success",
      data: { deal },
    });
  },
);

export const createDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    // Validate body
    const { body } = CreateDealSchema.parse({ body: req.body });

    const deal = await dealService.createDeal(companyId, body, userId);

    res.status(201).json({
      status: "success",
      data: { deal },
    });
  },
);

export const updateDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { params, body } = UpdateDealSchema.parse({
      params: req.params,
      body: req.body,
    });
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    const deal = await dealService.updateDeal(params.id, companyId, body);

    res.status(200).json({
      status: "success",
      data: { deal },
    });
  },
);

export const updateDealOrder = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { params, body } = UpdateDealOrderSchema.parse({
      params: req.params,
      body: req.body,
    });
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    const deal = await dealService.updateDealOrder(
      params.id,
      companyId,
      body.order,
      body.stageId,
    );

    res.status(200).json({
      status: "success",
      data: { deal },
    });
  },
);

export const deleteDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { params } = DeleteDealSchema.parse({ params: req.params });
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    await dealService.deleteDeal(params.id, companyId);

    res.status(204).json({
      status: "success",
      data: null,
    });
  },
);

