import { dealRiskRepository } from "@/repositories/DealRiskRepository";
import { salesAnalyticsRepository } from "@/repositories/SalesAnalyticsRepository";

export interface DealRiskDTO {
  dealId: string;
  title: string;
  value: number;
  stageId: string;
  stageName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
  daysInStage: number;
  daysSinceLastActivity: number | null;
  overdueTaskCount: number;
  currentProbability: number;
  // Null when there isn't enough stage-history data yet to base a
  // suggestion on — we'd rather say nothing than guess.
  suggestedProbability: number | null;
}

const daysSince = (date: Date): number =>
  Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);

export class DealRiskService {
  /**
   * Explainable risk score for every open deal — every point added has a
   * human-readable reason attached, on purpose: a black-box score a rep
   * can't audit is a score they'll ignore.
   */
  async getRiskScoresForOpenDeals(companyId: string): Promise<DealRiskDTO[]> {
    const [signals, conversionRows] = await Promise.all([
      dealRiskRepository.getOpenDealSignals(companyId),
      salesAnalyticsRepository.getStageConversion(companyId),
    ]);

    // Stage-history-derived "days a deal usually spends here" isn't
    // available from getStageConversion (that's win-rate, not velocity) —
    // reuse the velocity query instead, keyed by stageId.
    const velocityRows = await salesAnalyticsRepository.getStageVelocity(companyId);
    const avgDaysByStage = new Map(velocityRows.map((r) => [r.stageId, r.avgDays]));
    const conversionByStage = new Map(
      conversionRows.map((r) => [
        r.stageId,
        Number(r.dealsEntered) > 0 ? Math.round((Number(r.dealsWon) / Number(r.dealsEntered)) * 100) : null,
      ]),
    );

    return signals.map((row) => {
      const reasons: string[] = [];
      let score = 0;

      const daysInStage = daysSince(row.stageEnteredAt);
      const avgForStage = avgDaysByStage.get(row.stageId);
      if (avgForStage !== undefined && daysInStage > avgForStage * 1.5) {
        score += 30;
        reasons.push(
          `Lleva ${daysInStage} días en "${row.stageName}", más del promedio de ${Math.round(avgForStage)} días para esta etapa`,
        );
      } else if (avgForStage === undefined && daysInStage > 21) {
        score += 20;
        reasons.push(`Lleva ${daysInStage} días sin cambiar de etapa`);
      }

      const daysSinceLastActivity = row.lastActivityAt ? daysSince(row.lastActivityAt) : null;
      if (daysSinceLastActivity === null) {
        score += 20;
        reasons.push("No tiene actividad registrada");
      } else if (daysSinceLastActivity > 14) {
        score += 25;
        reasons.push(`Sin actividad hace ${daysSinceLastActivity} días`);
      } else if (daysSinceLastActivity > 7) {
        score += 15;
        reasons.push(`Sin actividad hace ${daysSinceLastActivity} días`);
      }

      if (row.overdueTaskCount > 0) {
        score += Math.min(row.overdueTaskCount * 10, 25);
        reasons.push(
          row.overdueTaskCount === 1
            ? "1 tarea vencida"
            : `${row.overdueTaskCount} tareas vencidas`,
        );
      }

      if (row.expectedCloseDate && new Date(row.expectedCloseDate) < new Date()) {
        score += 15;
        reasons.push("La fecha de cierre esperada ya pasó");
      }

      score = Math.min(score, 100);
      const riskLevel: DealRiskDTO["riskLevel"] =
        score >= 60 ? "high" : score >= 30 ? "medium" : "low";

      // Suggest a probability from this stage's historical win rate, pulled
      // slightly toward 0 the riskier this specific deal looks. Never
      // auto-applied — the rep decides.
      const stageWinRate = conversionByStage.get(row.stageId);
      let suggestedProbability: number | null = null;
      if (stageWinRate !== null && stageWinRate !== undefined) {
        const penalty = riskLevel === "high" ? 15 : riskLevel === "medium" ? 5 : 0;
        suggestedProbability = Math.max(0, Math.min(100, stageWinRate - penalty));
      }

      return {
        dealId: row.dealId,
        title: row.title,
        value: row.value,
        stageId: row.stageId,
        stageName: row.stageName,
        assignedToId: row.assignedToId,
        assignedToName: row.assignedToName,
        riskScore: score,
        riskLevel,
        reasons,
        daysInStage,
        daysSinceLastActivity,
        overdueTaskCount: row.overdueTaskCount,
        currentProbability: row.probability,
        suggestedProbability,
      };
    });
  }

  /**
   * Feeds the dashboard's "Deals Estancados" and "Tareas Vencidas" cards,
   * which have shown hardcoded 0s since they were built. One pass over the
   * risk list instead of two separate queries.
   */
  async getDealHealthSummary(
    companyId: string,
    stalledThresholdDays = 30,
  ): Promise<{ stalledDealsCount: number; totalOverdueTasks: number }> {
    const risks = await this.getRiskScoresForOpenDeals(companyId);
    return {
      stalledDealsCount: risks.filter((r) => r.daysInStage > stalledThresholdDays).length,
      totalOverdueTasks: risks.reduce((sum, r) => sum + r.overdueTaskCount, 0),
    };
  }
}

export const dealRiskService = new DealRiskService();
