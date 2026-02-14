import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { dealService } from "../../services/dealService";
import {
  CreateDealSchema,
  UpdateDealSchema,
  UpdateDealOrderSchema,
  GetDealsSchema,
  GetDealSchema,
  DeleteDealSchema,
} from "../../schemas/deal.schema";

export const getDeals = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    console.log("DEBUG: Entered getDeals controller. Query:", req.query);
    const companyId = req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID is missing", 400));

    try {
      // Validate query params
      console.log("DEBUG: Parsing schema...");
      const { query } = GetDealsSchema.parse({ query: req.query });
      console.log("DEBUG: Schema parsed:", query);

      const deals = await dealService.getDeals(companyId, {
        pipelineId: query.pipelineId,
        stageId: query.stageId,
        accountId: query.accountId,
        contactId: query.contactId,
      });

      console.log("DEBUG: Service returned deals:", deals.length);

      res.status(200).json({
        status: "success",
        results: deals.length,
        data: { deals },
      });
    } catch (error) {
      console.error("DEBUG: getDeals CRASHED:", error);
      throw error;
    }
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
