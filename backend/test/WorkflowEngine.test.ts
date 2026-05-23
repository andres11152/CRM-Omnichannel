// Mock external AI providers immediately to avoid network calls and require errors
jest.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () => "mocked-gemini-response",
            },
          }),
        }),
      };
    }),
  };
});

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      return {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: "mocked-openai-response" } }],
            }),
          },
        },
      };
    }),
  };
});

import { workflowEngine } from "../src/services/WorkflowEngine";
import { emailService } from "../src/services/email/emailService";
import { companySettingsService } from "../src/services/CompanySettingsService";
import { workflowRepository } from "../src/repositories/WorkflowRepository";
import { workflowExecutionRepository } from "../src/repositories/WorkflowExecutionRepository";
import { userRepository } from "../src/repositories/UserRepository";
import { dealRepository } from "../src/repositories/DealRepository";
import { contactRepository } from "../src/repositories/ContactRepository";
import { activityRepository } from "../src/repositories/ActivityRepository";
import { flowSessionRepository } from "../src/repositories/FlowSessionRepository";

// Mock Repositories
jest.mock("../src/repositories/WorkflowRepository", () => {
  return {
    workflowRepository: {
      findMany: jest.fn(),
    },
  };
});

jest.mock("../src/repositories/WorkflowExecutionRepository", () => {
  return {
    workflowExecutionRepository: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };
});

jest.mock("../src/repositories/UserRepository", () => {
  return {
    userRepository: {
      findFirst: jest.fn(),
    },
  };
});

jest.mock("../src/repositories/DealRepository", () => {
  return {
    dealRepository: {
      findById: jest.fn(),
    },
  };
});

jest.mock("../src/repositories/ContactRepository", () => {
  return {
    contactRepository: {
      findFirst: jest.fn(),
    },
  };
});

jest.mock("../src/repositories/ActivityRepository", () => {
  return {
    activityRepository: {
      create: jest.fn(),
    },
  };
});

jest.mock("../src/repositories/FlowSessionRepository", () => {
  return {
    flowSessionRepository: {
      findAIAssistant: jest.fn(),
      findAIConfig: jest.fn(),
    },
  };
});

// Mock services
jest.mock("../src/services/email/emailService", () => {
  return {
    emailService: {
      sendEmail: jest.fn(),
    },
  };
});

jest.mock("../src/services/CompanySettingsService", () => {
  return {
    companySettingsService: {
      getSenderConfig: jest.fn(),
    },
  };
});

describe("WorkflowEngine", () => {
  const companyId = "company_123";
  const systemUserId = "user_system_001";
  const dealId = "deal_789";

  beforeEach(() => {
    jest.clearAllMocks();

    (userRepository.findFirst as jest.Mock).mockResolvedValue({ id: systemUserId, companyId });
    (workflowExecutionRepository.create as jest.Mock).mockResolvedValue({ id: "exec_001" });
  });

  describe("Event Trigger & Matching", () => {
    it("should trigger a workflow execution when a DEAL_CREATED event is emitted and stage conditions match", async () => {
      const payload = {
        dealId,
        companyId,
        newStage: "negotiation",
      };

      const mockWorkflow = {
        id: "wf_1",
        companyId,
        isActive: true,
        triggerType: "EVENT",
        triggerConfig: {
          event: "DEAL_CREATED",
          condition: { stage: "negotiation" },
        },
        nodes: [
          { id: "n_start", type: "START", data: {} },
          { id: "n_task", type: "action_task", data: { label: "Hacer llamada", content: "Llamar cliente" } },
        ],
        edges: [
          { id: "e1", source: "n_start", target: "n_task" },
        ],
      };

      (workflowRepository.findMany as jest.Mock).mockResolvedValue([mockWorkflow]);

      // Emit event
      workflowEngine.emit("DEAL_CREATED", payload);

      // Yield event loop execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(workflowExecutionRepository.create).toHaveBeenCalledWith({
        data: {
          workflowId: "wf_1",
          companyId,
          status: "PENDING",
        },
      });

      expect(activityRepository.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "TASK",
          subject: "Hacer llamada",
          description: "Llamar cliente",
          dealId,
          status: "PENDING",
          createdById: systemUserId,
        }),
      });

      expect(workflowExecutionRepository.update).toHaveBeenCalledWith({
        where: { id: "exec_001" },
        data: expect.objectContaining({
          status: "SUCCESS",
          completedAt: expect.any(Date),
        }),
      });
    });

    it("should skip execution if stage conditions do not match", async () => {
      const payload = {
        dealId,
        companyId,
        newStage: "lost",
      };

      const mockWorkflow = {
        id: "wf_1",
        companyId,
        isActive: true,
        triggerConfig: {
          event: "DEAL_CREATED",
          condition: { stage: "negotiation" },
        },
      };

      (workflowRepository.findMany as jest.Mock).mockResolvedValue([mockWorkflow]);

      workflowEngine.emit("DEAL_CREATED", payload);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(workflowExecutionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("Workflow Action Handlers", () => {
    it("should execute action_email resolving variables and tenant settings", async () => {
      const payload = {
        dealId,
        companyId,
        newStage: "won",
        title: "Suscripción Premium",
      };

      const mockWorkflow = {
        id: "wf_email",
        companyId,
        isActive: true,
        triggerConfig: { event: "DEAL_UPDATED" },
        nodes: [
          { id: "n_start", type: "START", data: {} },
          { id: "n_email", type: "action_email", data: { options: ["Cliente", "Felicidades {{title}}"], content: "Hola, ganaste {{title}}" } },
        ],
        edges: [{ id: "e1", source: "n_start", target: "n_email" }],
      };

      // Mock client email fetch
      (dealRepository.findById as jest.Mock).mockResolvedValue({
        id: dealId,
        contact: { id: "contact_001", email: "cliente@gmail.com" },
      });

      // Mock SMTP SPF settings
      (companySettingsService.getSenderConfig as jest.Mock).mockResolvedValue({
        fromEmail: "soporte@skycode.io",
        fromName: "SkyCode Agency",
      });

      (workflowRepository.findMany as jest.Mock).mockResolvedValue([mockWorkflow]);

      workflowEngine.emit("DEAL_UPDATED", payload);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(emailService.sendEmail).toHaveBeenCalledWith({
        companyId,
        to: ["cliente@gmail.com"],
        subject: "Felicidades Suscripción Premium",
        bodyHtml: "Hola, ganaste Suscripción Premium",
        bodyText: "Hola, ganaste Suscripción Premium",
        contactId: "contact_001",
        from: '"SkyCode Agency" <soporte@skycode.io>',
      });

      expect(activityRepository.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "EMAIL",
          subject: " Email Automático: Felicidades Suscripción Premium",
          status: "COMPLETED",
        }),
      });
    });

    it("should execute action_ai nodes correctly using GEMINI provider", async () => {
      const payload = {
        dealId,
        companyId,
        newStage: "ai_analysis",
        variables: {},
      };

      const mockWorkflow = {
        id: "wf_ai",
        companyId,
        isActive: true,
        triggerConfig: { event: "DEAL_CREATED" },
        nodes: [
          { id: "n_start", type: "START", data: {} },
          { id: "n_ai", type: "AI_AGENT", data: { aiAssistantId: "agent_123", content: "Analiza el deal" } },
        ],
        edges: [{ id: "e1", source: "n_start", target: "n_ai" }],
      };

      (flowSessionRepository.findAIAssistant as jest.Mock).mockResolvedValue({
        id: "agent_123",
        modelProvider: "GEMINI",
        modelName: "gemini-2.5-flash",
        systemPrompt: "Eres un analista",
      });

      (flowSessionRepository.findAIConfig as jest.Mock).mockResolvedValue({
        geminiKey: "fake_gemini_key",
      });

      (workflowRepository.findMany as jest.Mock).mockResolvedValue([mockWorkflow]);

      workflowEngine.emit("DEAL_CREATED", payload);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(payload.variables).toEqual({
        last_ai_response: "mocked-gemini-response",
      });
      expect(workflowExecutionRepository.update).toHaveBeenCalledWith({
        where: { id: "exec_001" },
        data: expect.objectContaining({
          status: "SUCCESS",
        }),
      });
    });

    it("should execute action_ai nodes correctly using OPENAI provider", async () => {
      const payload = {
        dealId,
        companyId,
        newStage: "ai_analysis",
        variables: {},
      };

      const mockWorkflow = {
        id: "wf_openai",
        companyId,
        isActive: true,
        triggerConfig: { event: "DEAL_CREATED" },
        nodes: [
          { id: "n_start", type: "START", data: {} },
          { id: "n_ai", type: "action_ai", data: { aiAssistantId: "agent_openai", content: "Resumen de ventas" } },
        ],
        edges: [{ id: "e1", source: "n_start", target: "n_ai" }],
      };

      (flowSessionRepository.findAIAssistant as jest.Mock).mockResolvedValue({
        id: "agent_openai",
        modelProvider: "OPENAI",
        modelName: "gpt-4o",
        systemPrompt: "Eres consultor",
      });

      (flowSessionRepository.findAIConfig as jest.Mock).mockResolvedValue({
        openaiKey: "fake_openai_key",
      });

      (workflowRepository.findMany as jest.Mock).mockResolvedValue([mockWorkflow]);

      workflowEngine.emit("DEAL_CREATED", payload);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(payload.variables).toEqual({
        last_ai_response: "mocked-openai-response",
      });
    });

    it("should save status FAILED and record errors if any handler crashes", async () => {
      const payload = {
        dealId,
        companyId,
        newStage: "neg",
      };

      const mockWorkflow = {
        id: "wf_crash",
        companyId,
        isActive: true,
        triggerConfig: { event: "DEAL_CREATED" },
        nodes: [
          { id: "n_start", type: "START", data: {} },
          { id: "n_ai", type: "AI_AGENT", data: {} }, // Missing aiAssistantId triggers error in execution
        ],
        edges: [{ id: "e1", source: "n_start", target: "n_ai" }],
      };

      (workflowRepository.findMany as jest.Mock).mockResolvedValue([mockWorkflow]);

      workflowEngine.emit("DEAL_CREATED", payload);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(workflowExecutionRepository.update).toHaveBeenCalledWith({
        where: { id: "exec_001" },
        data: expect.objectContaining({
          status: "FAILED",
          error: "AI Agent node missing AssistantId",
        }),
      });
    });
  });
});
