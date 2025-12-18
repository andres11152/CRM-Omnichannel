import { Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { AuthenticatedRequest } from "../../types";
import { prisma } from "../../config/prisma";
import { workflowEngine } from "../../services/workflowEngine";

// Get all deals for a company (grouped by pipeline or filtered)
export const getDeals = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const { pipelineId, stageId, accountId, contactId } = req.query;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    const where: any = { companyId };
    if (pipelineId) where.pipelineId = pipelineId as string;
    if (stageId) where.stageId = stageId as string;
    if (accountId) where.accountId = accountId as string;
    if (contactId) where.contactId = contactId as string;

    const deals = await prisma.deal.findMany({
      where,
      include: {
        pipeline: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true, order: true } },
        account: { select: { name: true } },
        contact: { select: { name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: [
        { stageId: "asc" },
        { order: "asc" }, // Order within stage for Kanban
      ],
    });

    res.status(200).json({
      status: "success",
      results: deals.length,
      data: { deals },
    });
  }
);

// Get single deal with full details
export const getDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const deal = await prisma.deal.findFirst({
      where: { id, companyId },
      include: {
        pipeline: true,
        stage: true,
        account: true,
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        activities: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
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

// Create new deal
export const createDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.user?.companyId;
    const {
      title,
      value,
      currency,
      pipelineId, // NEW: explicit pipeline selection
      stageId, // NEW: explicit stage selection
      probability,
      expectedCloseDate,
      accountId,
      contactId,
      assignedToId,
    } = req.body;

    if (!companyId) {
      return next(new AppError("Company ID is missing", 400));
    }

    if (!title) {
      return next(new AppError("Title is required", 400));
    }

    // Get default pipeline if not provided
    let targetPipelineId = pipelineId;
    let targetStageId = stageId;

    if (!targetPipelineId) {
      const defaultPipeline = await prisma.pipeline.findFirst({
        where: { companyId, isDefault: true },
        include: { stages: { orderBy: { order: "asc" }, take: 1 } },
      });

      if (!defaultPipeline) {
        return next(
          new AppError(
            "No default pipeline found. Please create one first.",
            400
          )
        );
      }

      targetPipelineId = defaultPipeline.id;

      // Use first stage if not provided
      if (!targetStageId && defaultPipeline.stages.length > 0) {
        targetStageId = defaultPipeline.stages[0].id;
      }
    }

    // Verify stage belongs to pipeline
    if (targetStageId) {
      const stage = await prisma.stage.findFirst({
        where: { id: targetStageId, pipelineId: targetPipelineId },
      });

      if (!stage) {
        return next(
          new AppError("Stage does not belong to the selected pipeline", 400)
        );
      }
    } else {
      return next(new AppError("Stage ID is required", 400));
    }

    // Get max order in the stage for positioning
    const maxOrder = await prisma.deal.aggregate({
      where: { stageId: targetStageId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max.order || 0) + 1;

    // Convert empty strings to undefined for optional foreign keys
    const dealData = {
      companyId,
      pipelineId: targetPipelineId,
      stageId: targetStageId,
      title,
      value: value || 0,
      currency: currency || "USD",
      order: newOrder,
      probability: probability || 10,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      accountId: accountId && accountId !== "" ? accountId : undefined,
      contactId: contactId && contactId !== "" ? contactId : undefined,
      assignedToId:
        assignedToId && assignedToId !== "" ? assignedToId : undefined,
    };

    const deal = await prisma.deal.create({
      data: dealData,
      include: {
        pipeline: true,
        stage: true,
        account: true,
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    // Emit Event
    workflowEngine.emit("DEAL_CREATED", {
      dealId: deal.id,
      companyId,
      stageId: deal.stageId,
      pipelineId: deal.pipelineId,
    });

    res.status(201).json({
      status: "success",
      data: { deal },
    });
  }
);

// Update deal (including moving between stages)
export const updateDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.user?.companyId;

    const deal = await prisma.deal.findFirst({
      where: { id, companyId },
      include: { stage: true, pipeline: true },
    });

    if (!deal) {
      return next(new AppError("Deal not found", 404));
    }

    // Sanitize update data
    const updateData: any = { ...req.body };

    // Remove fields that shouldn't be updated directly
    delete updateData.companyId;
    delete updateData.createdAt;

    // Handle empty strings for optional foreign keys
    if (updateData.accountId === "") updateData.accountId = null;
    if (updateData.contactId === "") updateData.contactId = null;
    if (updateData.assignedToId === "") updateData.assignedToId = null;
    if (updateData.expectedCloseDate) {
      updateData.expectedCloseDate = new Date(updateData.expectedCloseDate);
    }

    // If stage is changing, verify it belongs to the pipeline
    if (updateData.stageId && updateData.stageId !== deal.stageId) {
      const targetPipelineId = updateData.pipelineId || deal.pipelineId;

      const newStage = await prisma.stage.findFirst({
        where: { id: updateData.stageId, pipelineId: targetPipelineId },
      });

      if (!newStage) {
        return next(
          new AppError("Target stage does not belong to the pipeline", 400)
        );
      }

      // Reset order when moving to new stage
      const maxOrder = await prisma.deal.aggregate({
        where: { stageId: updateData.stageId },
        _max: { order: true },
      });

      updateData.order = (maxOrder._max.order || 0) + 1;
    }

    const updatedDeal = await prisma.deal.update({
      where: { id },
      data: updateData,
      include: {
        pipeline: true,
        stage: true,
        account: true,
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    // Emit workflow event if stage changed
    if (deal.stageId !== updatedDeal.stageId) {
      workflowEngine.emit("DEAL_UPDATED", {
        dealId: deal.id,
        companyId,
        previousStageId: deal.stageId,
        newStageId: updatedDeal.stageId,
        previousStageName: deal.stage.name,
        newStageName: updatedDeal.stage.name,
      });
    }

    res.status(200).json({
      status: "success",
      data: { deal: updatedDeal },
    });
  }
);

// Update deal order within stage (for drag-and-drop)
export const updateDealOrder = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { newOrder, newStageId } = req.body;
    const companyId = req.user?.companyId;

    const deal = await prisma.deal.findFirst({
      where: { id, companyId },
    });

    if (!deal) {
      return next(new AppError("Deal not found", 404));
    }

    const updateData: any = {
      order: newOrder,
    };

    // If moving to a different stage
    if (newStageId && newStageId !== deal.stageId) {
      // Verify stage belongs to same pipeline
      const newStage = await prisma.stage.findFirst({
        where: { id: newStageId, pipelineId: deal.pipelineId },
      });

      if (!newStage) {
        return next(new AppError("Invalid stage for this pipeline", 400));
      }

      updateData.stageId = newStageId;
    }

    const updatedDeal = await prisma.deal.update({
      where: { id },
      data: updateData,
      include: {
        stage: true,
        pipeline: true,
      },
    });

    // Emit event if stage changed
    if (newStageId && newStageId !== deal.stageId) {
      workflowEngine.emit("DEAL_UPDATED", {
        dealId: deal.id,
        companyId,
        previousStageId: deal.stageId,
        newStageId: updatedDeal.stageId,
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
