import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/prisma";
import { workflowEngine } from "../../services/workflowEngine";

// Get all deals for a company
export const getDeals = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const { stage, accountId } = req.query;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const where: any = { companyId };
    if (stage) where.stage = stage;
    if (accountId) where.accountId = accountId;

    const deals = await prisma.deal.findMany({
      where,
      include: {
        account: { select: { name: true } },
        contact: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      results: deals.length,
      data: { deals },
    });
  }
);

// Get single deal
export const getDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const deal = await prisma.deal.findFirst({
      where: { id, companyId },
      include: {
        account: true,
        contact: true,
        assignedTo: true,
        activities: {
          orderBy: { createdAt: "desc" },
          include: { createdBy: { select: { name: true } } },
        },
      },
    });

    if (!deal) {
      return next(new AppError("Deal not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: { deal },
    });
  }
);

// Create deal
export const createDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const {
      title,
      value,
      currency,
      stage,
      probability,
      expectedCloseDate,
      accountId,
      contactId,
      assignedToId,
    } = req.body;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    // Convert empty strings to undefined for optional foreign keys
    const dealData = {
      companyId,
      title,
      value: value || 0,
      currency: currency || "USD",
      stage: stage || "NEW",
      probability: probability || 10,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      accountId: accountId && accountId !== "" ? accountId : undefined,
      contactId: contactId && contactId !== "" ? contactId : undefined,
      assignedToId:
        assignedToId && assignedToId !== "" ? assignedToId : undefined,
    };

    const deal = await prisma.deal.create({
      data: dealData,
    });

    // Emit Event
    workflowEngine.emit("DEAL_CREATED", { dealId: deal.id, companyId });

    res.status(201).json({
      status: "success",
      data: { deal },
    });
  }
);

// Update deal
export const updateDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const deal = await prisma.deal.findFirst({ where: { id, companyId } });

    if (!deal) {
      return next(new AppError("Deal not found", 404));
    }

    // Sanitize update data - convert empty strings to null for optional foreign keys
    const updateData = { ...req.body };
    if (updateData.accountId === "") updateData.accountId = null;
    if (updateData.contactId === "") updateData.contactId = null;
    if (updateData.assignedToId === "") updateData.assignedToId = null;
    if (updateData.expectedCloseDate) {
      updateData.expectedCloseDate = new Date(updateData.expectedCloseDate);
    }

    const updatedDeal = await prisma.deal.update({
      where: { id },
      data: updateData,
    });

    // Emit Event if stage changed
    if (deal.stage !== updatedDeal.stage) {
      workflowEngine.emit("DEAL_UPDATED", {
        dealId: deal.id,
        companyId,
        previousStage: deal.stage,
        newStage: updatedDeal.stage,
      });
    }

    res.status(200).json({
      status: "success",
      data: { deal: updatedDeal },
    });
  }
);

// Delete deal
export const deleteDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const deal = await prisma.deal.findFirst({ where: { id, companyId } });

    if (!deal) {
      return next(new AppError("Deal not found", 404));
    }

    await prisma.deal.delete({ where: { id } });

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);
