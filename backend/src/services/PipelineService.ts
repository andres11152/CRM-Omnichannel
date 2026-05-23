import { PipelineRepository } from "../repositories/PipelineRepository";
import { StageRepository } from "../repositories/StageRepository";
import { AppError } from "../utils/AppError";
import {
  CreatePipelineInput,
  UpdatePipelineInput,
} from "../schemas/pipelineSchema";

export class PipelineService {
  private pipelineRepo: PipelineRepository;
  private stageRepo: StageRepository;

  constructor() {
    this.pipelineRepo = new PipelineRepository();
    this.stageRepo = new StageRepository();
  }

  async getPipelines(companyId: string) {
    return this.pipelineRepo.findMany(companyId);
  }

  async getPipeline(id: string, companyId: string) {
    const pipeline = await this.pipelineRepo.findById(id, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);
    return pipeline;
  }

  async createPipeline(companyId: string, data: CreatePipelineInput) {
    // data.name is guaranteed to be string by Zod schema
    if (data.isDefault) {
      await this.pipelineRepo.updateMany(
        { companyId, isDefault: true },
        { isDefault: false },
      );
    }

    const pipeline = await this.pipelineRepo.create({
      company: { connect: { id: companyId } },
      name: data.name,
      isDefault: data.isDefault || false,
    });

    if (data.stages && data.stages.length > 0) {
      await Promise.all(
        data.stages.map((stage, index) =>
          this.stageRepo.create({
            pipeline: { connect: { id: pipeline.id } },
            name: stage.name,
            order: stage.order !== undefined ? stage.order : index,
            color: stage.color || "#6B7280",
          }),
        ),
      );
    } else {
      const defaultStages = [
        { name: "Nuevo Lead", order: 1, color: "#3B82F6" },
        { name: "Contactado", order: 2, color: "#6366F1" },
        { name: "Calificado", order: 3, color: "#8B5CF6" },
        { name: "Propuesta", order: 4, color: "#F59E0B" },
        { name: "Negociación", order: 5, color: "#EC4899" },
        { name: "Cerrado Ganado", order: 6, color: "#10B981" },
        { name: "Cerrado Perdido", order: 7, color: "#EF4444" },
      ];
      await Promise.all(
        defaultStages.map((stage) =>
          this.stageRepo.create({
            pipeline: { connect: { id: pipeline.id } },
            ...stage,
          }),
        ),
      );
    }

    return this.pipelineRepo.findById(pipeline.id, companyId);
  }

  async updatePipeline(
    id: string,
    companyId: string,
    data: UpdatePipelineInput,
  ) {
    const pipeline = await this.pipelineRepo.findById(id, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    if (data.isDefault && !pipeline.isDefault) {
      await this.pipelineRepo.updateMany(
        { companyId, isDefault: true, id: { not: id } },
        { isDefault: false },
      );
    }

    return this.pipelineRepo.update(id, companyId, data);
  }

  async deletePipeline(id: string, companyId: string) {
    const pipeline = await this.pipelineRepo.findById(id, companyId);
    if (!pipeline) throw new AppError("Pipeline not found", 404);

    if (pipeline._count.deals > 0) {
      throw new AppError(
        `Cannot delete pipeline with ${pipeline._count.deals} active deals. Move or delete deals first.`,
        400,
      );
    }

    if (pipeline.isDefault) {
      const count = await this.pipelineRepo.count({
        companyId,
        id: { not: id },
      });
      if (count === 0)
        throw new AppError(
          "Cannot delete the only pipeline. Create another one first.",
          400,
        );
    }

    await this.pipelineRepo.delete(id, companyId);
  }

  async duplicatePipeline(id: string, companyId: string, name?: string) {
    const sourcePipeline = await this.pipelineRepo.findById(id, companyId);
    if (!sourcePipeline) throw new AppError("Source pipeline not found", 404);

    const newPipeline = await this.pipelineRepo.create({
      company: { connect: { id: companyId } },
      name: name || `${sourcePipeline.name} (Copy)`,
      isDefault: false,
    });

    await Promise.all(
      sourcePipeline.stages.map((stage) =>
        this.stageRepo.create({
          pipeline: { connect: { id: newPipeline.id } },
          name: stage.name,
          order: stage.order,
          color: stage.color,
        }),
      ),
    );

    return this.pipelineRepo.findById(newPipeline.id, companyId);
  }
}

export const pipelineService = new PipelineService();
