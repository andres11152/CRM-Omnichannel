/// <reference types="jest" />
import { stageService } from "../src/services/StageService";
import { StageRepository } from "../src/repositories/StageRepository";
import { PipelineRepository } from "../src/repositories/PipelineRepository";
import { AppError } from "../src/utils/AppError";

// Mock dependencies (variables declared inside jest.mock are safe from hoisting TDZ errors)
jest.mock("../src/repositories/StageRepository", () => {
  const mockInstance = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    updateOrders: jest.fn(),
    count: jest.fn(),
  };
  return {
    StageRepository: jest.fn().mockImplementation(() => mockInstance),
    stageRepository: mockInstance,
  };
});

jest.mock("../src/repositories/PipelineRepository", () => {
  const mockInstance = {
    findById: jest.fn(),
  };
  return {
    PipelineRepository: jest.fn().mockImplementation(() => mockInstance),
    pipelineRepository: mockInstance,
  };
});

describe("StageService", () => {
  const companyId = "company_123";
  const pipelineId = "pipe_abc";
  const stageId = "stage_xyz";

  let mockStageRepo: jest.Mocked<StageRepository>;
  let mockPipelineRepo: jest.Mocked<PipelineRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStageRepo = new StageRepository() as unknown as jest.Mocked<StageRepository>;
    mockPipelineRepo = new PipelineRepository() as unknown as jest.Mocked<PipelineRepository>;
  });

  describe("getStages", () => {
    it("should return all stages for a valid pipeline owned by company", async () => {
      mockPipelineRepo.findById.mockResolvedValue({ id: pipelineId, companyId } as unknown as Awaited<ReturnType<PipelineRepository["findById"]>>);
      mockStageRepo.findMany.mockResolvedValue([{ id: "s1", order: 1 }] as unknown as Awaited<ReturnType<StageRepository["findMany"]>>);

      const stages = await stageService.getStages(pipelineId, companyId);

      expect(mockPipelineRepo.findById).toHaveBeenCalledWith(pipelineId, companyId);
      expect(mockStageRepo.findMany).toHaveBeenCalledWith(pipelineId);
      expect(stages).toHaveLength(1);
    });

    it("should throw 404 AppError if pipeline is not found/not owned", async () => {
      mockPipelineRepo.findById.mockResolvedValue(null);

      await expect(stageService.getStages(pipelineId, companyId)).rejects.toThrow(
        new AppError("Pipeline not found", 404)
      );
    });
  });

  describe("updateStage", () => {
    it("should update a stage's parameters securely specifying pipelineId", async () => {
      mockPipelineRepo.findById.mockResolvedValue({ id: pipelineId } as unknown as Awaited<ReturnType<PipelineRepository["findById"]>>);
      mockStageRepo.findById.mockResolvedValue({ id: stageId, pipelineId } as unknown as Awaited<ReturnType<StageRepository["findById"]>>);
      mockStageRepo.update.mockResolvedValue({ id: stageId, name: "New Name" } as unknown as Awaited<ReturnType<StageRepository["update"]>>);

      const updated = await stageService.updateStage(pipelineId, stageId, companyId, { name: "New Name" });

      expect(mockStageRepo.update).toHaveBeenCalledWith(stageId, pipelineId, { name: "New Name" });
      expect(updated.name).toBe("New Name");
    });
  });

  describe("reorderStages", () => {
    it("should securely delegate transactional order update to stageRepository", async () => {
      const reorderPayload = [
        { id: "s1", order: 0 },
        { id: "s2", order: 1 },
      ];

      mockPipelineRepo.findById.mockResolvedValue({ id: pipelineId } as unknown as Awaited<ReturnType<PipelineRepository["findById"]>>);
      mockStageRepo.updateOrders.mockResolvedValue(null as unknown as Awaited<ReturnType<StageRepository["updateOrders"]>>);
      mockStageRepo.findMany.mockResolvedValue([] as unknown as Awaited<ReturnType<StageRepository["findMany"]>>);

      await stageService.reorderStages(pipelineId, companyId, reorderPayload);

      expect(mockStageRepo.updateOrders).toHaveBeenCalledWith(pipelineId, reorderPayload);
    });
  });

  describe("deleteStage", () => {
    it("should throw 400 AppError if the stage has active deals", async () => {
      mockPipelineRepo.findById.mockResolvedValue({ id: pipelineId } as unknown as Awaited<ReturnType<PipelineRepository["findById"]>>);
      mockStageRepo.findById.mockResolvedValue({
        id: stageId,
        pipelineId,
        _count: { deals: 5 },
      } as unknown as Awaited<ReturnType<StageRepository["findById"]>>);

      await expect(stageService.deleteStage(pipelineId, stageId, companyId)).rejects.toThrow(
        new AppError("Cannot delete stage with 5 active deals. Move deals first.", 400)
      );
    });

    it("should throw 400 AppError if it is the only stage left in pipeline", async () => {
      mockPipelineRepo.findById.mockResolvedValue({ id: pipelineId } as unknown as Awaited<ReturnType<PipelineRepository["findById"]>>);
      mockStageRepo.findById.mockResolvedValue({
        id: stageId,
        pipelineId,
        _count: { deals: 0 },
      } as unknown as Awaited<ReturnType<StageRepository["findById"]>>);
      mockStageRepo.count.mockResolvedValue(1);

      await expect(stageService.deleteStage(pipelineId, stageId, companyId)).rejects.toThrow(
        new AppError("Cannot delete the only stage in the pipeline", 400)
      );
    });

    it("should call delete on repository with both stageId and pipelineId if checks pass", async () => {
      mockPipelineRepo.findById.mockResolvedValue({ id: pipelineId } as unknown as Awaited<ReturnType<PipelineRepository["findById"]>>);
      mockStageRepo.findById.mockResolvedValue({
        id: stageId,
        pipelineId,
        _count: { deals: 0 },
      } as unknown as Awaited<ReturnType<StageRepository["findById"]>>);
      mockStageRepo.count.mockResolvedValue(3);
      mockStageRepo.delete.mockResolvedValue({ id: stageId } as unknown as Awaited<ReturnType<StageRepository["delete"]>>);

      await stageService.deleteStage(pipelineId, stageId, companyId);

      expect(mockStageRepo.delete).toHaveBeenCalledWith(stageId, pipelineId);
    });
  });
});
