import { flowService } from "../src/services/FlowService";
import { workflowRepository } from "../src/repositories/WorkflowRepository";
import { flowSessionRepository } from "../src/repositories/FlowSessionRepository";
import { cacheService } from "../src/services/CacheService";
import { planLimitsService } from "../src/services/PlanLimitsService";
import { AppError } from "../src/utils/AppError";

// Mock repositories and services
jest.mock("../src/repositories/WorkflowRepository", () => {
  return {
    workflowRepository: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
});

jest.mock("../src/repositories/FlowSessionRepository", () => {
  return {
    flowSessionRepository: {
      findManySessions: jest.fn(),
    },
  };
});

jest.mock("../src/services/CacheService", () => {
  return {
    cacheService: {
      delete: jest.fn(),
    },
  };
});

jest.mock("../src/services/PlanLimitsService", () => {
  return {
    planLimitsService: {
      canCreateResource: jest.fn(),
    },
  };
});

describe("FlowService", () => {
  const companyId = "company_123";
  const flowId = "flow_abc";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("findAll & findOne", () => {
    it("should query workflow repository for all flows inside company", async () => {
      (workflowRepository.findMany as jest.Mock).mockResolvedValue([{ id: "f1" }]);
      const res = await flowService.findAll(companyId);
      expect(workflowRepository.findMany).toHaveBeenCalledWith({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });
      expect(res).toHaveLength(1);
    });

    it("should find first workflow matching id and company", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue({ id: flowId });
      const res = await flowService.findOne(flowId, companyId);
      expect(workflowRepository.findFirst).toHaveBeenCalledWith({
        where: { id: flowId, companyId },
      });
      expect(res?.id).toBe(flowId);
    });
  });

  describe("getStats", () => {
    it("should calculate and aggregate correct session stats and node visits", async () => {
      const mockFlow = { id: flowId, companyId };
      const mockSessions = [
        { visitedNodes: ["n1", "n2"], isActive: true, completedAt: null },
        { visitedNodes: ["n1", "n3"], isActive: false, completedAt: new Date() },
        { visitedNodes: ["n1"], isActive: false, completedAt: null },
      ];

      (workflowRepository.findFirst as jest.Mock).mockResolvedValue(mockFlow);
      (flowSessionRepository.findManySessions as jest.Mock).mockResolvedValue(mockSessions);

      const stats = await flowService.getStats(flowId, companyId);

      expect(stats.totalSessions).toBe(3);
      expect(stats.activeSessions).toBe(1);
      expect(stats.completedSessions).toBe(1);
      expect(stats.nodeStats).toEqual({
        n1: 3,
        n2: 1,
        n3: 1,
      });
    });

    it("should throw 404 AppError if workflow is not found", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(flowService.getStats(flowId, companyId)).rejects.toThrow(
        new AppError("Flow not found", 404)
      );
    });
  });

  describe("create", () => {
    it("should create a workflow when plan limit is not exceeded", async () => {
      (planLimitsService.canCreateResource as jest.Mock).mockResolvedValue(true);
      (workflowRepository.create as jest.Mock).mockResolvedValue({ id: "new_flow", name: "Test Flow" });

      const flow = await flowService.create(companyId, { name: "Test Flow", isActive: true });

      expect(planLimitsService.canCreateResource).toHaveBeenCalledWith(companyId, "workflows");
      expect(workflowRepository.create).toHaveBeenCalled();
      expect(flow.id).toBe("new_flow");
    });

    it("should block active workflow creation if plan limit is exceeded", async () => {
      (planLimitsService.canCreateResource as jest.Mock).mockResolvedValue(false);

      await expect(
        flowService.create(companyId, { name: "Limit Test", isActive: true })
      ).rejects.toThrow(new AppError("You have reached the active workflows limit for your plan", 403));

      expect(workflowRepository.create).not.toHaveBeenCalled();
    });

    it("should allow inactive workflow creation even if plan limit is reached", async () => {
      (workflowRepository.create as jest.Mock).mockResolvedValue({ id: "inactive_flow", name: "Inactive" });

      const flow = await flowService.create(companyId, { name: "Inactive", isActive: false });

      expect(planLimitsService.canCreateResource).not.toHaveBeenCalled();
      expect(flow.isActive).toBeUndefined(); // Returns the mock create result
    });
  });

  describe("update", () => {
    it("should update flow and clear cache", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue({ id: flowId });
      (workflowRepository.update as jest.Mock).mockResolvedValue({ id: flowId, name: "New Name" });

      const updated = await flowService.update(flowId, companyId, { name: "New Name" });

      expect(workflowRepository.update).toHaveBeenCalled();
      expect(cacheService.delete).toHaveBeenCalledWith(`workflow:${flowId}`);
      expect(updated.name).toBe("New Name");
    });

    it("should throw 404 if updating non-existing workflow", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        flowService.update(flowId, companyId, { name: "Fail" })
      ).rejects.toThrow(new AppError("Flow not found", 404));
    });
  });

  describe("delete", () => {
    it("should delete flow from DB and clear cache", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue({ id: flowId, name: "To Delete" });

      await flowService.delete(flowId, companyId);

      expect(workflowRepository.delete).toHaveBeenCalledWith(flowId, companyId);
      expect(cacheService.delete).toHaveBeenCalledWith(`workflow:${flowId}`);
    });
  });

  describe("toggle", () => {
    it("should activate an inactive workflow if plan limit allows it", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue({ id: flowId, isActive: false });
      (planLimitsService.canCreateResource as jest.Mock).mockResolvedValue(true);
      (workflowRepository.update as jest.Mock).mockResolvedValue({ id: flowId, isActive: true });

      const res = await flowService.toggle(flowId, companyId);

      expect(planLimitsService.canCreateResource).toHaveBeenCalledWith(companyId, "workflows");
      expect(workflowRepository.update).toHaveBeenCalledWith({
        where: { id: flowId },
        data: { isActive: true },
      });
      expect(cacheService.delete).toHaveBeenCalledWith(`workflow:${flowId}`);
      expect(res.isActive).toBe(true);
    });

    it("should block activation if plan limit is reached", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue({ id: flowId, isActive: false });
      (planLimitsService.canCreateResource as jest.Mock).mockResolvedValue(false);

      await expect(flowService.toggle(flowId, companyId)).rejects.toThrow(
        new AppError("You have reached the active workflows limit for your plan", 403)
      );
    });

    it("should deactivate an active workflow without checking plan limit", async () => {
      (workflowRepository.findFirst as jest.Mock).mockResolvedValue({ id: flowId, isActive: true });
      (workflowRepository.update as jest.Mock).mockResolvedValue({ id: flowId, isActive: false });

      const res = await flowService.toggle(flowId, companyId);

      expect(planLimitsService.canCreateResource).not.toHaveBeenCalled();
      expect(workflowRepository.update).toHaveBeenCalledWith({
        where: { id: flowId },
        data: { isActive: false },
      });
      expect(res.isActive).toBe(false);
    });
  });

  describe("duplicate", () => {
    it("should create an inactive copy of a workflow", async () => {
      const mockOriginal = {
        id: flowId,
        name: "My Flow",
        triggerType: "KEYWORD",
        triggerConfig: { keyword: "hi" },
        nodes: [],
        edges: [],
      };

      (workflowRepository.findFirst as jest.Mock).mockResolvedValue(mockOriginal);
      (workflowRepository.create as jest.Mock).mockResolvedValue({
        id: "flow_copy",
        name: "My Flow (Copy)",
        isActive: false,
      });

      const res = await flowService.duplicate(flowId, companyId);

      expect(workflowRepository.create).toHaveBeenCalledWith({
        data: {
          companyId,
          name: "My Flow (Copy)",
          triggerType: "KEYWORD",
          triggerConfig: { keyword: "hi" },
          nodes: [],
          edges: [],
          isActive: false,
        },
      });
      expect(res.name).toBe("My Flow (Copy)");
    });
  });
});
