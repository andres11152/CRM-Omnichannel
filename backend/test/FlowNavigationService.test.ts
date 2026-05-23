import { FlowNavigationService } from "../src/services/flow/FlowNavigationService";
import { flowSessionRepository } from "../src/repositories/FlowSessionRepository";
import { cacheService } from "../src/services/CacheService";
import { Prisma } from "@prisma/client";

// Mock repositories
jest.mock("../src/repositories/FlowSessionRepository", () => {
  return {
    flowSessionRepository: {
      findWorkflow: jest.fn(),
      deleteActiveSessions: jest.fn(),
      createSession: jest.fn(),
      deleteSession: jest.fn(),
      updateSession: jest.fn(),
    },
  };
});

// Mock CacheService
jest.mock("../src/services/CacheService", () => {
  return {
    cacheService: {
      wrap: jest.fn((key, cb) => cb()),
      delete: jest.fn(),
    },
  };
});

describe("FlowNavigationService", () => {
  let navigationService: FlowNavigationService;

  beforeEach(() => {
    jest.clearAllMocks();
    navigationService = new FlowNavigationService();
  });

  describe("startNewSession", () => {
    it("should resolve explicit START node and initialize new session", async () => {
      const mockFlow = {
        id: "flow_1",
        nodes: [
          { id: "node_start", type: "START", data: {} },
          { id: "node_msg", type: "SEND_MESSAGE", data: { message: "Hola" } },
        ],
        edges: [
          { id: "edge_1", source: "node_start", target: "node_msg" },
        ],
      };

      (flowSessionRepository.findWorkflow as jest.Mock).mockResolvedValue(mockFlow);
      (flowSessionRepository.createSession as jest.Mock).mockResolvedValue({
        id: "session_123",
        contactId: "contact_1",
        flowId: "flow_1",
        companyId: "company_1",
        conversationId: "conv_1",
        currentNodeId: "node_start",
        isActive: true,
        variables: {},
        visitedNodes: ["node_start"],
      });

      const session = await navigationService.startNewSession(
        "flow_1",
        "contact_1",
        "company_1",
        "conv_1"
      );

      expect(flowSessionRepository.deleteActiveSessions).toHaveBeenCalledWith("contact_1", "flow_1");
      expect(flowSessionRepository.createSession).toHaveBeenCalledWith({
        contactId: "contact_1",
        flowId: "flow_1",
        companyId: "company_1",
        conversationId: "conv_1",
        currentNodeId: "node_start",
        isActive: true,
        variables: {},
        visitedNodes: ["node_start"],
      });
      expect(session.currentNodeId).toBe("node_start");
    });

    it("should fallback to topological root (no incoming edges) if START/TRIGGER is missing", async () => {
      const mockFlow = {
        id: "flow_topological",
        nodes: [
          { id: "node_implicit_root", type: "SEND_MESSAGE", data: { message: "First" } },
          { id: "node_msg_2", type: "SEND_MESSAGE", data: { message: "Second" } },
        ],
        edges: [
          { id: "edge_1", source: "node_implicit_root", target: "node_msg_2" },
        ],
      };

      (flowSessionRepository.findWorkflow as jest.Mock).mockResolvedValue(mockFlow);
      (flowSessionRepository.createSession as jest.Mock).mockResolvedValue({
        id: "session_123",
        currentNodeId: "node_implicit_root",
        visitedNodes: ["node_implicit_root"],
      });

      const session = await navigationService.startNewSession(
        "flow_topological",
        "contact_1",
        "company_1",
        "conv_1"
      );

      expect(session.currentNodeId).toBe("node_implicit_root");
      expect(flowSessionRepository.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          currentNodeId: "node_implicit_root",
        })
      );
    });

    it("should throw error if no nodes are found", async () => {
      const mockFlow = {
        id: "flow_empty",
        nodes: [],
        edges: [],
      };

      (flowSessionRepository.findWorkflow as jest.Mock).mockResolvedValue(mockFlow);

      await expect(
        navigationService.startNewSession("flow_empty", "contact_1", "company_1", "conv_1")
      ).rejects.toThrow("No START node found");
    });

    it("should invalidate the cache when Prisma throws a P2003 foreign key violation", async () => {
      const mockFlow = {
        id: "flow_fk_fail",
        nodes: [{ id: "node_start", type: "START", data: {} }],
        edges: [],
      };

      (flowSessionRepository.findWorkflow as jest.Mock).mockResolvedValue(mockFlow);
      const mockPrismaError = new Prisma.PrismaClientKnownRequestError("FK violation", {
        code: "P2003",
        clientVersion: "4.0.0",
      });
      (flowSessionRepository.createSession as jest.Mock).mockRejectedValue(mockPrismaError);

      await expect(
        navigationService.startNewSession("flow_fk_fail", "contact_1", "company_1", "conv_1")
      ).rejects.toThrow(mockPrismaError);

      expect(cacheService.delete).toHaveBeenCalledWith("workflow:flow_fk_fail");
    });
  });

  describe("endSession", () => {
    it("should call deleteSession in repository", async () => {
      await navigationService.endSession("session_abc");
      expect(flowSessionRepository.deleteSession).toHaveBeenCalledWith("session_abc");
    });
  });

  describe("moveToNextNode", () => {
    it("should update session state with the target node from matching edge", async () => {
      const flowStructure = {
        nodes: [
          { id: "node_1", type: "START" as const, data: {}, position: { x: 0, y: 0 } },
          { id: "node_2", type: "SEND_MESSAGE" as const, data: {}, position: { x: 0, y: 0 } },
        ],
        edges: [
          { id: "e1", source: "node_1", target: "node_2" },
        ],
      };

      await navigationService.moveToNextNode("session_abc", "node_1", flowStructure);

      expect(flowSessionRepository.updateSession).toHaveBeenCalledWith(
        "session_abc",
        expect.objectContaining({
          currentNodeId: "node_2",
          lastStepAt: expect.any(Date),
        })
      );
    });

    it("should end session if no outgoing edge is found for current node", async () => {
      const flowStructure = {
        nodes: [
          { id: "node_1", type: "START" as const, data: {}, position: { x: 0, y: 0 } },
        ],
        edges: [],
      };

      await navigationService.moveToNextNode("session_abc", "node_1", flowStructure);

      expect(flowSessionRepository.deleteSession).toHaveBeenCalledWith("session_abc");
    });
  });

  describe("moveToSpecificNode", () => {
    it("should update session current node directly to target ID", async () => {
      await navigationService.moveToSpecificNode("session_abc", "node_target");
      expect(flowSessionRepository.updateSession).toHaveBeenCalledWith(
        "session_abc",
        expect.objectContaining({
          currentNodeId: "node_target",
          lastStepAt: expect.any(Date),
        })
      );
    });
  });
});
