import { dealRepository, DealRepository } from "../repositories/DealRepository";
import {
  pipelineRepository,
  PipelineRepository,
} from "../repositories/PipelineRepository";
import {
  stageRepository,
  StageRepository,
} from "../repositories/StageRepository";
import { AppError } from "../utils/AppError";
import { workflowEngine } from "./workflowEngine";
import { Prisma } from "@prisma/client";
import { CreateDealInput, UpdateDealInput } from "../schemas/deal.schema";

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
    const where: Prisma.DealWhereInput = {}; // Middleware injects companyId
    if (filters.pipelineId) where.pipelineId = filters.pipelineId;
    if (filters.stageId) where.stageId = filters.stageId;
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.contactId) where.contactId = filters.contactId;

    try {
      console.log("DEBUG: getDeals query:", JSON.stringify(where));
      const deals = await this.dealRepo.findMany(where, [
        { stageId: "asc" },
        { order: "asc" },
      ]);
      console.log("DEBUG: getDeals result count:", deals.length);
      return deals;
    } catch (error) {
      console.error("DEBUG: getDeals ERROR:", error);
      throw error;
    }
  }

  async getDeal(id: string, companyId: string) {
    const deal = await this.dealRepo.findById(id, companyId);
    if (!deal) throw new AppError("Deal not found", 404);
    return deal;
  }

  async createDeal(companyId: string, data: CreateDealInput) {
    const {
      title,
      value,
      currency,
      probability,
      expectedCloseDate,
      accountId,
      contactId,
      assignedToId,
    } = data;

    // Default Pipeline resolution if pipelineId not provided
    const pipelineId = data.pipelineId;
    const stageId = data.stageId;

    // Although schemas require pipelineId and stageId, this logic supports a scenario where they might not be
    // but the schema I saw earlier had them as Required.
    // Assuming Zod ensures they are present if they are not optional in schema.
    // In deal.schema.ts: pipelineId: string (required), stageId: string (required).
    // So we don't need 'if (!pipelineId)' logic unless we loosen schema later.
    // BUT the schema uses baseDealFields.pipelineId which is required string.
    // So data.pipelineId is string.

    // Verify Stage (redundant check but good for business logic integrity)
    const stage = await this.stageRepo.findById(stageId, pipelineId);
    if (!stage)
      throw new AppError("Stage does not belong to the selected pipeline", 400);

    // Order
    const maxOrder = await this.dealRepo.getMaxOrder(stageId);
    const newOrder = (maxOrder._max.order || 0) + 1;

    const dealData: Prisma.DealCreateInput = {
      title,
      company: { connect: { id: companyId } },
      pipeline: { connect: { id: pipelineId } },
      stage: { connect: { id: stageId } },
      value: value || 0,
      currency: currency || "USD",
      order: newOrder,
      probability: probability || 10,
      expectedCloseDate: expectedCloseDate ?? null,
      account: accountId ? { connect: { id: accountId } } : undefined,
      contact: contactId ? { connect: { id: contactId } } : undefined,
      assignedTo: assignedToId ? { connect: { id: assignedToId } } : undefined,
    };

    const deal = await this.dealRepo.create(dealData);

    workflowEngine.emit("DEAL_CREATED", {
      dealId: deal.id,
      companyId,
      stageId: deal.stageId,
      pipelineId: deal.pipelineId,
    });

    return deal;
  }

  async updateDeal(id: string, companyId: string, data: UpdateDealInput) {
    const deal = await this.dealRepo.findById(id, companyId);
    if (!deal) throw new AppError("Deal not found", 404);

    const updateData: Prisma.DealUncheckedUpdateInput = { ...data };

    // Stage Change Logic
    if (
      updateData.stageId &&
      typeof updateData.stageId === "string" &&
      updateData.stageId !== deal.stageId
    ) {
      const targetPipelineId =
        (typeof updateData.pipelineId === "string"
          ? updateData.pipelineId
          : undefined) || deal.pipelineId;
      const newStage = await this.stageRepo.findById(
        updateData.stageId,
        targetPipelineId,
      );
      if (!newStage)
        throw new AppError("Target stage does not belong to the pipeline", 400);

      const maxOrder = await this.dealRepo.getMaxOrder(updateData.stageId);
      updateData.order = (maxOrder._max.order || 0) + 1;
    }

    const updatedDeal = await this.dealRepo.update(id, updateData);

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

    const updatedDeal = await this.dealRepo.update(id, updateData);

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
    await this.dealRepo.delete(id);
  }
}

export const dealService = new DealService();
