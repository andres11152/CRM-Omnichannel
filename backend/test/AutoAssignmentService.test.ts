/// <reference types="jest" />
import { assignTicketToAgent } from "../src/services/AutoAssignmentService";
import { QueueRepository } from "../src/repositories/QueueRepository";
import { TicketRepository } from "../src/repositories/TicketRepository";

// Mock dependencies (declaring variables inside closures prevents hoisting reference errors)
jest.mock("../src/repositories/QueueRepository", () => {
  const mockInstance = {
    findUnique: jest.fn(),
  };
  return {
    QueueRepository: jest.fn().mockImplementation(() => mockInstance),
    queueRepository: mockInstance,
  };
});

jest.mock("../src/repositories/TicketRepository", () => {
  const mockInstance = {
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    getAgentLoads: jest.fn(),
  };
  return {
    TicketRepository: jest.fn().mockImplementation(() => mockInstance),
    ticketRepository: mockInstance,
  };
});

describe("AutoAssignmentService", () => {
  const companyId = "company_123";
  const ticketId = "ticket_abc";
  const queueId = "queue_rr";

  let mockQueueRepo: jest.Mocked<QueueRepository>;
  let mockTicketRepo: jest.Mocked<TicketRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueRepo = new QueueRepository() as unknown as jest.Mocked<QueueRepository>;
    mockTicketRepo = new TicketRepository() as unknown as jest.Mocked<TicketRepository>;
  });

  it("should assign ticket to eligible agent with the lowest load", async () => {
    // 1. Queue configuration with online agents
    const mockAgents = [
      { id: "agent_1", name: "Agent 1", maxConcurrency: 5, skills: [] },
      { id: "agent_2", name: "Agent 2", maxConcurrency: 5, skills: [] },
    ];
    mockQueueRepo.findUnique.mockResolvedValue({
      id: queueId,
      name: "Ventas RR",
      type: "ROUND_ROBIN",
      agents: mockAgents,
      config: {},
      companyId,
    } as any);

    // 2. Pre-fetched loads (Agent 1 has 2 tickets, Agent 2 has 1 ticket)
    mockTicketRepo.getAgentLoads.mockResolvedValue({
      agent_1: 2,
      agent_2: 1,
    });

    await assignTicketToAgent(companyId, ticketId, queueId);

    // Should query loads for both candidate IDs
    expect(mockTicketRepo.getAgentLoads).toHaveBeenCalledWith(["agent_1", "agent_2"], companyId);

    // Should update ticket to be assigned to Agent 2 (lowest load = 1)
    expect(mockTicketRepo.update).toHaveBeenCalledWith({
      where: { id: ticketId },
      data: {
        assignedTo: { connect: { id: "agent_2" } },
        status: "IN_PROGRESS",
      },
    }, companyId);
  });

  it("should enforce capacity checks and skip assignment if all agents are full", async () => {
    const mockAgents = [
      { id: "agent_1", name: "Agent 1", maxConcurrency: 2 },
    ];
    mockQueueRepo.findUnique.mockResolvedValue({
      id: queueId,
      name: "Full Queue",
      type: "ROUND_ROBIN",
      agents: mockAgents,
      companyId,
    } as any);

    // Agent has 2 tickets which equals maxConcurrency of 2
    mockTicketRepo.getAgentLoads.mockResolvedValue({
      agent_1: 2,
    });

    await assignTicketToAgent(companyId, ticketId, queueId);

    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it("should filter candidates based on queue requiredSkills config", async () => {
    const mockAgents = [
      { id: "agent_english", name: "English Agent", maxConcurrency: 5, skills: ["english"] },
      { id: "agent_spanish", name: "Spanish Agent", maxConcurrency: 5, skills: ["spanish"] },
    ];
    mockQueueRepo.findUnique.mockResolvedValue({
      id: queueId,
      name: "English Support",
      type: "ROUND_ROBIN",
      agents: mockAgents,
      config: { requiredSkills: ["english"] },
      companyId,
    } as any);

    mockTicketRepo.getAgentLoads.mockResolvedValue({
      agent_english: 1,
      agent_spanish: 0, // Spanish has less load, but lacks the english skill
    });

    await assignTicketToAgent(companyId, ticketId, queueId);

    // Only English agent should be queried for load and selected
    expect(mockTicketRepo.getAgentLoads).toHaveBeenCalledWith(["agent_english"], companyId);
    expect(mockTicketRepo.update).toHaveBeenCalledWith({
      where: { id: ticketId },
      data: {
        assignedTo: { connect: { id: "agent_english" } },
        status: "IN_PROGRESS",
      },
    }, companyId);
  });

  it("should skip assignment if the queue is type MANUAL", async () => {
    mockQueueRepo.findUnique.mockResolvedValue({
      id: queueId,
      name: "Manual Queue",
      type: "MANUAL",
      agents: [],
      companyId,
    } as any);

    await assignTicketToAgent(companyId, ticketId, queueId);

    expect(mockTicketRepo.getAgentLoads).not.toHaveBeenCalled();
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });
});
