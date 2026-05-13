import { DealRepository } from "../repositories/DealRepository";
import { PipelineRepository } from "../repositories/PipelineRepository";
import { StageRepository } from "../repositories/StageRepository";
import { AppError } from "../utils/AppError";
import { workflowEngine } from "./WorkflowEngine";
import { Prisma } from "@prisma/client";
import { CreateDealInput, UpdateDealInput } from "../schemas/dealSchema";
import { activityRepository } from "@/repositories/ActivityRepository";
import { Logger } from "@/utils/logger";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import { WebhookEvents } from "@/types/types";

export class DealService {
  private dealRepo: DealRepository;
  private pipelineRepo: PipelineRepository;
  private stageRepo: StageRepository;

  constructor() {
    this.dealRepo = new DealRepository();
    this.pipelineRepo = new PipelineRepository();
    this.stageRepo = new StageRepository();
  }

  async getDeals(
    companyId: string,
    filters: {
      pipelineId?: string;
      stageId?: string;
      accountId?: string;
      contactId?: string;
    },
  ) {
    const where: Prisma.DealWhereInput = {}; // Middleware injects || companyId
    if (filters.pipelineId) where.pipelineId = filters.pipelineId;
    if (filters.stageId) where.stageId = filters.stageId;
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.contactId) where.contactId = filters.contactId;

    try {
      Logger.debug("DEBUG: getDeals query:", { where });
      const deals = await this.dealRepo.findMany(where, [
        { stageId: "asc" },
        { order: "asc" },
      ]);
      Logger.debug("DEBUG: getDeals result count: " + deals.length);
      return deals;
    } catch (error) {
      Logger.error("DEBUG: getDeals ERROR:", error);
      throw error;
    }
  }

  async getDeal(id: string, companyId: string) {
    const deal = await this.dealRepo.findById(id, companyId);
    if (!deal) throw new AppError("Deal not found", 404);
    return deal;
  }

  async createDeal(companyId: string, data: CreateDealInput, userId?: string) {
    const {
      title,
      value,
      currency,
      probability,
      expectedCloseDate,
      accountId,
      contactId,
      assignedToId,
      notes,
      lostReason,
    } = data;

    const pipelineId = data.pipelineId;
    const stageId = data.stageId;

    // Verify Stage belongs to Pipeline
    const stage = await this.stageRepo.findById(stageId, pipelineId);
    if (!stage)
      throw new AppError("Stage does not belong to the selected pipeline", 400);

    // Auto-calculate order (append to end of column)
    const maxOrder = await this.dealRepo.getMaxOrder(stageId);
    const newOrder = (maxOrder._max.order || 0) + 1;

    // Detect if the stage is Won/Lost for auto-setting closedAt
    const isWonOrLost = /ganado|won|perdido|lost/i.test(stage.name);

    const dealData: Prisma.DealCreateInput = {
      title,
      company: { connect: { id: companyId } },
      pipeline: { connect: { id: pipelineId } },
      stage: { connect: { id: stageId } },
      value: value || 0,
      currency: currency || "COP",
      order: newOrder,
      probability: probability || 10,
      expectedCloseDate: expectedCloseDate || null,
      lostReason: lostReason || null,
      closedAt: isWonOrLost ? new Date() : null,
      account: accountId ? { connect: { id: accountId } } : undefined,
      contact: contactId ? { connect: { id: contactId } } : undefined,
      assignedTo: assignedToId ? { connect: { id: assignedToId } } : undefined,
    };

    const deal = await this.dealRepo.create(dealData);

    //  Auto-create initial Activity note if notes provided
    if (notes && userId) {
      try {
        await activityRepository.create({
          data: {
            companyId,
            type: "NOTE",
            subject: `Initial note: ${title}`,
            description: notes,
            status: "COMPLETED",
            dealId: deal.id,
            accountId: accountId || null,
            contactId: contactId || null,
            createdById: userId,
          },
        });
      } catch (activityError) {
        Logger.error(
          "[DealService] Failed to create initial activity:",
          activityError,
        );
        // Non-blocking: deal was created successfully, activity is || supplementary
      }
    }

    workflowEngine.emit("DEAL_CREATED", {
      dealId: deal.id,
      companyId,
      stageId: deal.stageId,
      pipelineId: deal.pipelineId,
    });

    // [WEBHOOK] Dispatch deal.created event
    void webhookDispatcher.dispatch(companyId, WebhookEvents.DEAL_CREATED, {
      id: deal.id,
      title: deal.title,
      value: deal.value,
      currency: deal.currency,
      stageId: deal.stageId,
      pipelineId: deal.pipelineId,
    });

    return deal;
  }

  async updateDeal(id: string, companyId: string, data: UpdateDealInput) {
    const deal = await this.dealRepo.findById(id, companyId);
    if (!deal) throw new AppError("Deal not found", 404);

    const updateData: Prisma.DealUncheckedUpdateInput = {};

    // Copy allowed fields (exclude computed fields)
    if (data.title !== undefined) updateData.title = data.title;
    if (data.value !== undefined) updateData.value = data.value;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.pipelineId !== undefined) updateData.pipelineId = data.pipelineId;
    if (data.probability !== undefined)
      updateData.probability = data.probability;
    if (data.expectedCloseDate !== undefined)
      updateData.expectedCloseDate = data.expectedCloseDate || null;
    if (data.order !== undefined) updateData.order = data.order;
    if (data.contactId !== undefined)
      updateData.contactId = data.contactId || null;
    if (data.accountId !== undefined)
      updateData.accountId = data.accountId || null;
    if (data.assignedToId !== undefined)
      updateData.assignedToId = data.assignedToId || null;
    if (data.lostReason !== undefined)
      updateData.lostReason = data.lostReason || null;

    // Stage Change Logic
    if (data.stageId && data.stageId !== deal.stageId) {
      const targetPipelineId =
        (typeof data.pipelineId === "string" ? data.pipelineId : undefined) ||
        deal.pipelineId;
      const newStage = await this.stageRepo.findById(
        data.stageId,
        targetPipelineId,
      );
      if (!newStage)
        throw new AppError("Target stage does not belong to the pipeline", 400);

      updateData.stageId = data.stageId;
      const maxOrder = await this.dealRepo.getMaxOrder(data.stageId);
      updateData.order = (maxOrder._max.order || 0) + 1;

      // Auto-set closedAt when moving to Won/Lost stages
      const isClosingStage = /ganado|won|perdido|lost/i.test(newStage.name);
      if (isClosingStage && !deal.closedAt) {
        updateData.closedAt = new Date();
      } else if (!isClosingStage && deal.closedAt) {
        // Reopening a closed deal
        updateData.closedAt = null;
        updateData.lostReason = null;
      }
    }

    const updatedDeal = await this.dealRepo.update(id, companyId, updateData);

    if (deal.stageId !== updatedDeal.stageId) {
      workflowEngine.emit("DEAL_UPDATED", {
        dealId: deal.id,
        companyId,
        previousStageId: deal.stageId,
        newStageId: updatedDeal.stageId,
        previousStageName: deal.stage.name,
        newStageName: updatedDeal.stage.name,
      });

      // [WEBHOOK] Dispatch deal.stage_changed
      void webhookDispatcher.dispatch(companyId, WebhookEvents.DEAL_STAGE_CHANGED, {
        id: deal.id,
        title: deal.title,
        previousStage: deal.stage.name,
        newStage: updatedDeal.stage.name,
        value: updatedDeal.value,
      });

      // [WEBHOOK] Detect Won/Lost transitions
      const newStageName = updatedDeal.stage.name;
      if (/ganado|won/i.test(newStageName)) {
        void webhookDispatcher.dispatch(companyId, WebhookEvents.DEAL_WON, {
          id: deal.id, title: deal.title, value: updatedDeal.value, closedAt: updatedDeal.closedAt,
        });
      } else if (/perdido|lost/i.test(newStageName)) {
        void webhookDispatcher.dispatch(companyId, WebhookEvents.DEAL_LOST, {
          id: deal.id, title: deal.title, value: updatedDeal.value, lostReason: updatedDeal.lostReason,
        });
      }
    }

    return updatedDeal;
  }

  async updateDealOrder(
    id: string,
    companyId: string,
    newOrder: number,
    newStageId?: string,
  ) {
    const deal = await this.dealRepo.findById(id, companyId);
    if (!deal) throw new AppError("Deal not found", 404);

    const updateData: Prisma.DealUncheckedUpdateInput = { order: newOrder };

    if (newStageId && newStageId !== deal.stageId) {
      const newStage = await this.stageRepo.findById(
        newStageId,
        deal.pipelineId,
      );
      if (!newStage) throw new AppError("Invalid stage for this pipeline", 400);
      updateData.stageId = newStageId;
    }

    const updatedDeal = await this.dealRepo.update(id, companyId, updateData);

    if (newStageId && newStageId !== deal.stageId) {
      workflowEngine.emit("DEAL_UPDATED", {
        dealId: deal.id,
        companyId,
        previousStageId: deal.stageId,
        newStageId: updatedDeal.stageId,
      });
    }

    return updatedDeal;
  }

  async deleteDeal(id: string, companyId: string) {
    const deal = await this.dealRepo.findById(id, companyId);
    if (!deal) throw new AppError("Deal not found", 404);
    await this.dealRepo.delete(id, companyId);
  }
}

export const dealService = new DealService();

