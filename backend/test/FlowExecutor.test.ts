// Mock Queue producer immediately to prevent BullMQ/Redis connections on import
jest.mock("../src/services/queue/flowQueueService", () => {
  return {
    flowQueueService: {
      scheduleResume: jest.fn(),
    },
  };
});

import { FlowExecutorService } from "../src/services/FlowExecutor";
import { flowSessionRepository } from "../src/repositories/FlowSessionRepository";
import { flowQueueService } from "../src/services/queue/flowQueueService";
import { FlowNavigationService } from "../src/services/flow/FlowNavigationService";
import { FlowTriggerService } from "../src/services/flow/FlowTriggerService";
import { FlowNodeHandlers } from "../src/services/flow/FlowNodeHandlers";

// Mock repositories and internal workflow navigation
jest.mock("../src/repositories/FlowSessionRepository", () => {
  return {
    flowSessionRepository: {
      findSession: jest.fn(),
      updateSession: jest.fn(),
      findActiveSession: jest.fn(),
    },
  };
});

jest.mock("../src/services/flow/FlowNavigationService");
jest.mock("../src/services/flow/FlowTriggerService");
jest.mock("../src/services/flow/FlowNodeHandlers");

describe("FlowExecutorService", () => {
  let executor: FlowExecutorService;
  let mockNavigation: jest.Mocked<FlowNavigationService>;
  let mockTrigger: jest.Mocked<FlowTriggerService>;
  let mockNodeHandlers: jest.Mocked<FlowNodeHandlers>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Instantiate with mocked constructor methods
    executor = new FlowExecutorService();
    mockNavigation = (executor as any).navigation as jest.Mocked<FlowNavigationService>;
    mockTrigger = (executor as any).trigger as jest.Mocked<FlowTriggerService>;
    mockNodeHandlers = (executor as any).nodeHandlers as jest.Mocked<FlowNodeHandlers>;
  });

  describe("processMessage & Resumptions", () => {
    it("should return empty if no active session exists and no trigger is matched", async () => {
      (flowSessionRepository.findActiveSession as jest.Mock).mockResolvedValue(null);
      mockTrigger.checkTriggers.mockResolvedValue(null);

      const results = await executor.processMessage("contact_1", "hola", "conv_1", "company_1");

      expect(results).toEqual([]);
      expect(flowSessionRepository.findActiveSession).toHaveBeenCalledWith("contact_1");
      expect(mockTrigger.checkTriggers).toHaveBeenCalled();
    });

    it("should handle trigger context switch (end old session and start new)", async () => {
      const oldSession = { id: "old_sess", flowId: "flow_1", isActive: true, isPaused: false, flow: { isActive: true } };
      const newSession = { id: "new_sess", flowId: "flow_2", isActive: true, isPaused: false, currentNodeId: "node_start", visitedNodes: ["node_start"] };

      (flowSessionRepository.findActiveSession as jest.Mock).mockResolvedValue(oldSession);
      mockTrigger.checkTriggers.mockResolvedValue(newSession as any);
      (flowSessionRepository.findSession as jest.Mock).mockResolvedValue(newSession);

      // Flow graph layout
      const mockFlow = {
        isActive: true,
        nodes: [{ id: "node_start", type: "START", data: {} }],
        edges: [],
      };
      mockNavigation.getFlowCached.mockResolvedValue(mockFlow as any);

      await executor.processMessage("contact_1", "ayuda", "conv_1", "company_1");

      expect(mockNavigation.endSession).toHaveBeenCalledWith("old_sess");
      expect(mockNavigation.getFlowCached).toHaveBeenCalledWith("flow_2");
    });
  });

  describe("Conversational Yield vs Silent loop behavior", () => {
    it("should yield on OUTPUT_NODE_TYPES (e.g. SEND_MESSAGE) and schedule next step", async () => {
      const mockSession = {
        id: "sess_123",
        flowId: "flow_1",
        currentNodeId: "node_msg",
        isActive: true,
        isPaused: false,
        visitedNodes: ["node_msg"],
        companyId: "company_1",
        conversationId: "conv_1",
        flow: { isActive: true },
      };

      (flowSessionRepository.findActiveSession as jest.Mock).mockResolvedValue(mockSession);
      (flowSessionRepository.findSession as jest.Mock).mockResolvedValue(mockSession);

      const mockFlow = {
        isActive: true,
        nodes: [
          { id: "node_msg", type: "SEND_MESSAGE", data: { message: "Hola!" } },
        ],
        edges: [],
      };
      mockNavigation.getFlowCached.mockResolvedValue(mockFlow as any);
      mockNodeHandlers.handleSendNode.mockResolvedValue("Hola!");

      const results = await executor.processMessage("contact_1", "hello", "conv_1", "company_1");

      expect(results).toContain("Hola!");
      expect(flowSessionRepository.updateSession).toHaveBeenCalledWith("sess_123", expect.objectContaining({
        isPaused: true,
      }));
      expect(flowQueueService.scheduleResume).toHaveBeenCalledWith("sess_123", 1200);
    });

    it("should chain SILENT nodes (e.g. UPDATE_CONTACT) synchronously and keep looping", async () => {
      const mockSessionInit = {
        id: "sess_123",
        flowId: "flow_1",
        currentNodeId: "node_silent",
        isActive: true,
        isPaused: false,
        visitedNodes: [],
        companyId: "company_1",
        conversationId: "conv_1",
        flow: { isActive: true },
      };

      const mockSessionAfterSilent = {
        ...mockSessionInit,
        currentNodeId: "node_msg",
      };

      (flowSessionRepository.findActiveSession as jest.Mock).mockResolvedValue(mockSessionInit);
      // First findSession returns mockSessionInit, second returns mockSessionAfterSilent, third is inactive to end loop cleanly
      let callCount = 0;
      (flowSessionRepository.findSession as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mockSessionInit;
        if (callCount === 2) return mockSessionAfterSilent;
        return { ...mockSessionAfterSilent, isActive: false };
      });

      const mockFlow = {
        isActive: true,
        nodes: [
          { id: "node_silent", type: "UPDATE_CONTACT", data: {} },
          { id: "node_msg", type: "SEND_MESSAGE", data: { message: "Done" } },
        ],
        edges: [
          { id: "e1", source: "node_silent", target: "node_msg" },
        ],
      };
      mockNavigation.getFlowCached.mockResolvedValue(mockFlow as any);
      mockNodeHandlers.handleUpdateContactNode.mockResolvedValue(null);
      mockNodeHandlers.handleSendNode.mockResolvedValue("Done");

      const results = await executor.processMessage("contact_1", "hello", "conv_1", "company_1");

      // Execution should visit both
      expect(mockNodeHandlers.handleUpdateContactNode).toHaveBeenCalled();
      expect(mockNodeHandlers.handleSendNode).toHaveBeenCalled();
      expect(results).toContain("Done");
    });
  });

  describe("Safety protections", () => {
    it("should break infinite loops using MAX_LOOPS limit (20 iterations)", async () => {
      const mockSession = {
        id: "sess_loop",
        flowId: "flow_infinite",
        currentNodeId: "node_infinite",
        isActive: true,
        isPaused: false,
        visitedNodes: [],
        companyId: "company_1",
        conversationId: "conv_1",
        flow: { isActive: true },
      };

      (flowSessionRepository.findActiveSession as jest.Mock).mockResolvedValue(mockSession);
      (flowSessionRepository.findSession as jest.Mock).mockResolvedValue(mockSession);

      const mockFlow = {
        isActive: true,
        nodes: [
          { id: "node_infinite", type: "UPDATE_CONTACT", data: {} }, // Silent node, loops forever
        ],
        edges: [],
      };
      mockNavigation.getFlowCached.mockResolvedValue(mockFlow as any);
      mockNodeHandlers.handleUpdateContactNode.mockResolvedValue(null);

      const start = Date.now();
      const results = await executor.processMessage("contact_1", "hello", "conv_1", "company_1");
      const elapsed = Date.now() - start;

      // Should limit to 20 calls to prevent crashing the server
      expect(mockNodeHandlers.handleUpdateContactNode).toHaveBeenCalledTimes(20);
      expect(results).toEqual([]);
    });

    it("should handle node execution timeout cleanly by ending session", async () => {
      const mockSession = {
        id: "sess_timeout",
        flowId: "flow_1",
        currentNodeId: "node_ai",
        isActive: true,
        isPaused: false,
        visitedNodes: [],
        companyId: "company_1",
        conversationId: "conv_1",
        flow: { isActive: true },
      };

      (flowSessionRepository.findActiveSession as jest.Mock).mockResolvedValue(mockSession);
      (flowSessionRepository.findSession as jest.Mock).mockResolvedValue({ ...mockSession, isActive: false });

      const mockFlow = {
        isActive: true,
        nodes: [
          { id: "node_ai", type: "AI_AGENT", data: {} },
        ],
        edges: [],
      };
      mockNavigation.getFlowCached.mockResolvedValue(mockFlow as any);

      // Node execution hangs infinitely
      mockNodeHandlers.handleAIAgentNode.mockImplementation(() => {
        return new Promise<string>((resolve) => {
          // Never resolves
        });
      });

      // Spy on setTimeout to speed up the test OR trigger timeout immediately
      jest.useFakeTimers();

      const processPromise = executor.processMessage("contact_1", "pregunta", "conv_1", "company_1");

      // Flush microtasks to allow execution to reach Promise.race and register setTimeout
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      // Advance timers by the timeout value (45000ms for AI)
      jest.advanceTimersByTime(46000);

      // Flush microtasks to allow the timeout rejection to propagate through the async catch block
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      const results = await processPromise;

      expect(mockNavigation.endSession).toHaveBeenCalledWith("sess_timeout");
      expect(results).toContain("El proceso tardó demasiado. Por favor, intenta de nuevo.");

      jest.useRealTimers();
    });
  });
});
