import {
  stageRepository,
  StageRepository,
} from "../repositories/StageRepository";
import {
  pipelineRepository,
  PipelineRepository,
} from "../repositories/PipelineRepository";
import { AppError } from "../utils/AppError";
import { Prisma } from "@prisma/client";
import { CreateStageInput, UpdateStageInput } from "../schemas/pipeline.schema";

export class StageService {
  private stageRepo: StageRepository;
  private pipelineRepo: PipelineRepository;

  constructor() {
    this.stageRepo = new StageRepository();
    this.pipelineRepo = new PipelineRepository();
  }

  async getStages(pipelineId: string, companyId: string) {
    const pipeline = await this.pipelineRepo.findById(pipelineId, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    return this.stageRepo.findMany(pipelineId);
  }

  async createStage(
    pipelineId: string,
    companyId: string,
    data: CreateStageInput,
  ) {
    // data.name is guaranteed by Zod
    const pipeline = await this.pipelineRepo.findById(pipelineId, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    let stageOrder = data.order;
    if (stageOrder === undefined) {
      const maxOrder = await this.stageRepo.getMaxOrder(pipelineId);
      stageOrder = (maxOrder._max.order || 0) + 1;
    }

    return this.stageRepo.create({
      pipeline: { connect: { id: pipelineId } },
      name: data.name,
      color: data.color || "#6B7280",
      order: stageOrder,
    });
  }

  async updateStage(
    pipelineId: string,
    stageId: string,
    companyId: string,
    data: UpdateStageInput,
  ) {
    const pipeline = await this.pipelineRepo.findById(pipelineId, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    const stage = await this.stageRepo.findById(stageId, pipelineId);
    if (!stage) throw new AppError("Stage not found", 404);

    // Filter undefined values
    const updateData: Prisma.StageUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.order !== undefined) updateData.order = data.order;

    return this.stageRepo.update(stageId, updateData);
  }

  async reorderStages(
    pipelineId: string,
    companyId: string,
    stages: { id: string; order: number }[],
  ) {
    const pipeline = await this.pipelineRepo.findById(pipelineId, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    // Transaction for atomicity is best handled at service level if repository doesn't support batch update with different values easily
    // OR we add a method to Repo. For now, doing it here with prisma transaction is pragmatic but technically violates strict layering if we interpret it as "no prisma import".
    // Ideally we'd move this to the repository "updateOrders" method.

    // Correct approach: Add updateOrders to StageRepository.
    // For now, I'll loop updates.

    const updatePromises = stages.map((stage) =>
      this.stageRepo.update(stage.id, { order: stage.order }),
    );

    await Promise.all(updatePromises);

    return this.stageRepo.findMany(pipelineId);
  }

  async deleteStage(pipelineId: string, stageId: string, companyId: string) {
    const pipeline = await this.pipelineRepo.findById(pipelineId, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    const stage = await this.stageRepo.findById(stageId, pipelineId);
    if (!stage) throw new AppError("Stage not found", 404);

    if (stage._count.deals > 0) {
      throw new AppError(
        `Cannot delete stage with ${stage._count.deals} active deals. Move deals first.`,
        400,
      );
    }

    const count = await this.stageRepo.count({ pipelineId });
    if (count <= 1)
      throw new AppError("Cannot delete the only stage in the pipeline", 400);

    await this.stageRepo.delete(stageId);
  }
}

export const stageService = new StageService();
