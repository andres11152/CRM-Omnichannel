import { dealRiskRepository } from "../src/repositories/DealRiskRepository";
import { salesAnalyticsRepository } from "../src/repositories/SalesAnalyticsRepository";
import { dealRiskService } from "../src/services/DealRiskService";

jest.mock("../src/repositories/DealRiskRepository", () => ({
  dealRiskRepository: { getOpenDealSignals: jest.fn() },
}));

jest.mock("../src/repositories/SalesAnalyticsRepository", () => ({
  salesAnalyticsRepository: {
    getStageConversion: jest.fn(),
    getStageVelocity: jest.fn(),
  },
}));

const companyId = "company_123";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("DealRiskService.getRiskScoresForOpenDeals", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scores a healthy deal (recent activity, on pace) as low risk with no reasons", async () => {
    (dealRiskRepository.getOpenDealSignals as jest.Mock).mockResolvedValue([
      {
        dealId: "d1",
        title: "Healthy Deal",
        value: 1000,
        probability: 40,
        stageId: "s1",
        stageName: "Negociación",
        expectedCloseDate: daysAgo(-10), // still in the future
        assignedToId: "u1",
        assignedToName: "Ana",
        stageEnteredAt: daysAgo(2),
        lastActivityAt: daysAgo(1),
        overdueTaskCount: 0,
      },
    ]);
    (salesAnalyticsRepository.getStageConversion as jest.Mock).mockResolvedValue([]);
    (salesAnalyticsRepository.getStageVelocity as jest.Mock).mockResolvedValue([]);

    const [risk] = await dealRiskService.getRiskScoresForOpenDeals(companyId);

    expect(risk.riskScore).toBe(0);
    expect(risk.riskLevel).toBe("low");
    expect(risk.reasons).toEqual([]);
  });

  it("flags a deal stalled well beyond the stage average with the specific reason", async () => {
    (dealRiskRepository.getOpenDealSignals as jest.Mock).mockResolvedValue([
      {
        dealId: "d2",
        title: "Stalled Deal",
        value: 5000,
        probability: 30,
        stageId: "s1",
        stageName: "Negociación",
        expectedCloseDate: null,
        assignedToId: "u1",
        assignedToName: "Ana",
        stageEnteredAt: daysAgo(20), // 20 days in stage
        lastActivityAt: daysAgo(1),
        overdueTaskCount: 0,
      },
    ]);
    (salesAnalyticsRepository.getStageConversion as jest.Mock).mockResolvedValue([]);
    // Average for this stage is 5 days — 20 days is 4x, well past the 1.5x threshold
    (salesAnalyticsRepository.getStageVelocity as jest.Mock).mockResolvedValue([
      { stageId: "s1", stageName: "Negociación", transitions: 10, avgDays: 5 },
    ]);

    const [risk] = await dealRiskService.getRiskScoresForOpenDeals(companyId);

    expect(risk.riskScore).toBeGreaterThanOrEqual(30);
    expect(risk.reasons.some((r) => r.includes("promedio de 5 días"))).toBe(true);
  });

  it("stacks multiple risk signals and caps the score at 100", async () => {
    (dealRiskRepository.getOpenDealSignals as jest.Mock).mockResolvedValue([
      {
        dealId: "d3",
        title: "Everything Wrong Deal",
        value: 2000,
        probability: 20,
        stageId: "s1",
        stageName: "Negociación",
        expectedCloseDate: daysAgo(5), // already past
        assignedToId: null,
        assignedToName: null,
        stageEnteredAt: daysAgo(60),
        lastActivityAt: null, // never any activity
        overdueTaskCount: 5,
      },
    ]);
    (salesAnalyticsRepository.getStageConversion as jest.Mock).mockResolvedValue([]);
    (salesAnalyticsRepository.getStageVelocity as jest.Mock).mockResolvedValue([
      { stageId: "s1", stageName: "Negociación", transitions: 10, avgDays: 5 },
    ]);

    const [risk] = await dealRiskService.getRiskScoresForOpenDeals(companyId);

    // 30 (stalled) + 20 (no activity) + 25 (overdue, capped) + 15 (past close date) = 90
    expect(risk.riskScore).toBe(90);
    expect(risk.riskLevel).toBe("high");
    expect(risk.reasons.length).toBe(4);
  });

  it("suggests a probability from the stage's historical win rate, discounted for high risk, without touching the current one", async () => {
    (dealRiskRepository.getOpenDealSignals as jest.Mock).mockResolvedValue([
      {
        dealId: "d4",
        title: "Risky But Has History",
        value: 3000,
        probability: 50, // rep's manual value — must stay untouched
        stageId: "s1",
        stageName: "Negociación",
        expectedCloseDate: null,
        assignedToId: "u1",
        assignedToName: "Ana",
        stageEnteredAt: daysAgo(60),
        lastActivityAt: daysAgo(20),
        overdueTaskCount: 3,
      },
    ]);
    (salesAnalyticsRepository.getStageConversion as jest.Mock).mockResolvedValue([
      { stageId: "s1", stageName: "Negociación", dealsEntered: 10n, dealsWon: 6n }, // 60% win rate
    ]);
    (salesAnalyticsRepository.getStageVelocity as jest.Mock).mockResolvedValue([
      { stageId: "s1", stageName: "Negociación", transitions: 10, avgDays: 5 },
    ]);

    const [risk] = await dealRiskService.getRiskScoresForOpenDeals(companyId);

    expect(risk.currentProbability).toBe(50);
    expect(risk.riskLevel).toBe("high");
    // 60% win rate - 15 (high-risk penalty) = 45
    expect(risk.suggestedProbability).toBe(45);
  });

  it("does not suggest a probability when there's no stage-conversion history yet", async () => {
    (dealRiskRepository.getOpenDealSignals as jest.Mock).mockResolvedValue([
      {
        dealId: "d5",
        title: "No History Deal",
        value: 1000,
        probability: 10,
        stageId: "s2",
        stageName: "Nuevo Lead",
        expectedCloseDate: null,
        assignedToId: null,
        assignedToName: null,
        stageEnteredAt: daysAgo(1),
        lastActivityAt: daysAgo(1),
        overdueTaskCount: 0,
      },
    ]);
    (salesAnalyticsRepository.getStageConversion as jest.Mock).mockResolvedValue([]);
    (salesAnalyticsRepository.getStageVelocity as jest.Mock).mockResolvedValue([]);

    const [risk] = await dealRiskService.getRiskScoresForOpenDeals(companyId);

    expect(risk.suggestedProbability).toBeNull();
  });
});

describe("DealRiskService.getDealHealthSummary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("counts only deals past the threshold, and sums overdue tasks across all open deals", async () => {
    (dealRiskRepository.getOpenDealSignals as jest.Mock).mockResolvedValue([
      {
        dealId: "d1", title: "Old", value: 100, probability: 10, stageId: "s1", stageName: "X",
        expectedCloseDate: null, assignedToId: null, assignedToName: null,
        stageEnteredAt: daysAgo(45), lastActivityAt: daysAgo(1), overdueTaskCount: 2,
      },
      {
        dealId: "d2", title: "Recent", value: 100, probability: 10, stageId: "s1", stageName: "X",
        expectedCloseDate: null, assignedToId: null, assignedToName: null,
        stageEnteredAt: daysAgo(5), lastActivityAt: daysAgo(1), overdueTaskCount: 3,
      },
    ]);
    (salesAnalyticsRepository.getStageConversion as jest.Mock).mockResolvedValue([]);
    (salesAnalyticsRepository.getStageVelocity as jest.Mock).mockResolvedValue([]);

    const summary = await dealRiskService.getDealHealthSummary(companyId, 30);
    expect(summary.stalledDealsCount).toBe(1);
    expect(summary.totalOverdueTasks).toBe(5);
  });
});
