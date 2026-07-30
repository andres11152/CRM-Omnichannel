import { StageRepository } from "../repositories/StageRepository";
import { PipelineRepository } from "../repositories/PipelineRepository";
import { AppError } from "../utils/AppError";
import { Prisma } from "@prisma/client";
import { CreateStageInput, UpdateStageInput } from "../schemas/pipelineSchema";

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
      isWon: data.isWon ?? false,
      isLost: data.isLost ?? false,
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
    if (data.isWon !== undefined) updateData.isWon = data.isWon;
    if (data.isLost !== undefined) updateData.isLost = data.isLost;

    return this.stageRepo.update(stageId, pipelineId, updateData);
  }

  async reorderStages(
    pipelineId: string,
    companyId: string,
    stages: { id: string; order: number }[],
  ) {
    const pipeline = await this.pipelineRepo.findById(pipelineId, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    // Securely delegate transactional order updates to repository layer
    await this.stageRepo.updateOrders(pipelineId, stages);

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

    await this.stageRepo.delete(stageId, pipelineId);
  }
}

export const stageService = new StageService();

