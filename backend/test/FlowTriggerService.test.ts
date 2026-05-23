import { FlowTriggerService } from "../src/services/flow/FlowTriggerService";
import { FlowNavigationService } from "../src/services/flow/FlowNavigationService";
import { flowSessionRepository } from "../src/repositories/FlowSessionRepository";

// Mock dependencies
jest.mock("../src/repositories/FlowSessionRepository", () => {
  return {
    flowSessionRepository: {
      findActiveWorkflowsByTrigger: jest.fn(),
    },
  };
});

jest.mock("../src/services/flow/FlowNavigationService", () => {
  return {
    FlowNavigationService: jest.fn().mockImplementation(() => {
      return {
        startNewSession: jest.fn(),
      };
    }),
  };
});

describe("FlowTriggerService", () => {
  let triggerService: FlowTriggerService;
  let mockNavigationService: jest.Mocked<FlowNavigationService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigationService = new FlowNavigationService() as jest.Mocked<FlowNavigationService>;
    triggerService = new FlowTriggerService(mockNavigationService);
  });

  it("should match workflow when keyword matches exactly in lowercase", async () => {
    const mockFlows = [
      {
        id: "flow_1",
        triggerConfig: {
          keywords: ["hola"],
        },
      },
    ];

    (flowSessionRepository.findActiveWorkflowsByTrigger as jest.Mock).mockResolvedValue(mockFlows);
    mockNavigationService.startNewSession.mockResolvedValue({
      id: "session_1",
      contactId: "contact_1",
      flowId: "flow_1",
      companyId: "company_1",
      conversationId: "conv_1",
      currentNodeId: "start",
      isActive: true,
      isPaused: false,
      variables: {},
      visitedNodes: ["start"],
    });

    const result = await triggerService.checkTriggers(
      "contact_1",
      "hola",
      "company_1",
      "conv_1"
    );

    expect(flowSessionRepository.findActiveWorkflowsByTrigger).toHaveBeenCalledWith("company_1", "KEYWORD");
    expect(mockNavigationService.startNewSession).toHaveBeenCalledWith("flow_1", "contact_1", "company_1", "conv_1");
    expect(result).toBeDefined();
    expect(result?.id).toBe("session_1");
  });

  it("should match workflow with mixed casing and leading/trailing spaces", async () => {
    const mockFlows = [
      {
        id: "flow_1",
        triggerConfig: {
          keywords: ["ventas"],
        },
      },
    ];

    (flowSessionRepository.findActiveWorkflowsByTrigger as jest.Mock).mockResolvedValue(mockFlows);
    mockNavigationService.startNewSession.mockResolvedValue({
      id: "session_1",
      contactId: "contact_1",
      flowId: "flow_1",
      companyId: "company_1",
      conversationId: "conv_1",
      currentNodeId: "start",
      isActive: true,
      isPaused: false,
      variables: {},
      visitedNodes: ["start"],
    });

    const result = await triggerService.checkTriggers(
      "contact_1",
      "  VeNtAs  ",
      "company_1",
      "conv_1"
    );

    expect(mockNavigationService.startNewSession).toHaveBeenCalledWith("flow_1", "contact_1", "company_1", "conv_1");
    expect(result).toBeDefined();
  });

  it("should match string format triggerConfig.keyword/triggerConfig.keywords", async () => {
    const mockFlows = [
      {
        id: "flow_1",
        triggerConfig: {
          keyword: "soporte",
        },
      },
    ];

    (flowSessionRepository.findActiveWorkflowsByTrigger as jest.Mock).mockResolvedValue(mockFlows);

    await triggerService.checkTriggers("contact_1", "soporte técnico", "company_1", "conv_1");
    expect(mockNavigationService.startNewSession).toHaveBeenCalledWith("flow_1", "contact_1", "company_1", "conv_1");
  });

  it("should parse comma-separated keywords correctly", async () => {
    const mockFlows = [
      {
        id: "flow_1",
        triggerConfig: {
          keywords: ["ayuda, help, info"],
        },
      },
    ];

    (flowSessionRepository.findActiveWorkflowsByTrigger as jest.Mock).mockResolvedValue(mockFlows);

    await triggerService.checkTriggers("contact_1", "necesito help por favor", "company_1", "conv_1");
    expect(mockNavigationService.startNewSession).toHaveBeenCalledWith("flow_1", "contact_1", "company_1", "conv_1");
  });

  it("should skip triggering a flow if it is currently activeFlowId", async () => {
    const mockFlows = [
      {
        id: "flow_active",
        triggerConfig: {
          keywords: ["ayuda"],
        },
      },
    ];

    (flowSessionRepository.findActiveWorkflowsByTrigger as jest.Mock).mockResolvedValue(mockFlows);

    const result = await triggerService.checkTriggers(
      "contact_1",
      "ayuda",
      "company_1",
      "conv_1",
      "flow_active"
    );

    expect(mockNavigationService.startNewSession).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("should return null gracefully if triggerConfig is empty/corrupt", async () => {
    const mockFlows = [
      {
        id: "flow_corrupt",
        triggerConfig: null,
      },
    ];

    (flowSessionRepository.findActiveWorkflowsByTrigger as jest.Mock).mockResolvedValue(mockFlows);

    const result = await triggerService.checkTriggers(
      "contact_1",
      "cualquier cosa",
      "company_1",
      "conv_1"
    );

    expect(mockNavigationService.startNewSession).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
