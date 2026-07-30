import { salesAnalyticsRepository } from "@/repositories/SalesAnalyticsRepository";
import { companyRepository } from "@/repositories/CompanyRepository";
import { exportService } from "@/services/ExportService";
import dayjs from "dayjs";

export interface ExportResultDTO {
  downloadUrl: string;
  format: string;
  recordCount: number;
}

// --- DTOs ---

export interface SalesForecastDTO {
  period: { start: string; end: string };
  weightedForecast: number;
  openPipelineValue: number;
  dealCount: number;
}

export interface StageConversionDTO {
  stageId: string;
  stageName: string;
  dealsEntered: number;
  dealsWon: number;
  conversionRate: number;
}

export interface StageVelocityDTO {
  stageId: string;
  stageName: string;
  avgDays: number;
}

export interface LostReasonDTO {
  reason: string;
  count: number;
  value: number;
  percentage: number;
}

export interface RepLeaderboardDTO {
  userId: string;
  name: string;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  conversionRate: number;
}

// --- SERVICE ---

export class SalesAnalyticsService {
  /**
   * Weighted forecast: sum(value * probability/100) for open deals expected
   * to close within the period. Defaults to the current month.
   */
  async getForecast(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<SalesForecastDTO> {
    const start = startDate || dayjs().startOf("month").toDate();
    const end = endDate || dayjs().endOf("month").toDate();

    const deals = await salesAnalyticsRepository.getOpenDealsForForecast(
      companyId,
      start,
      end,
    );

    const weightedForecast = deals.reduce(
      (sum, d) => sum + d.value * (d.probability / 100),
      0,
    );
    const openPipelineValue = deals.reduce((sum, d) => sum + d.value, 0);

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      weightedForecast: Math.round(weightedForecast),
      openPipelineValue,
      dealCount: deals.length,
    };
  }

  /**
   * Per-stage conversion: of every deal that ever passed through a stage
   * (per the stage-history log), what fraction eventually landed in a
   * "won" stage. Requires stage-history data — sparse until it accumulates.
   */
  async getStageConversion(companyId: string): Promise<StageConversionDTO[]> {
    const rows = await salesAnalyticsRepository.getStageConversion(companyId);

    return rows.map((r) => {
      const entered = Number(r.dealsEntered);
      const won = Number(r.dealsWon);
      return {
        stageId: r.stageId,
        stageName: r.stageName,
        dealsEntered: entered,
        dealsWon: won,
        conversionRate: entered > 0 ? Math.round((won / entered) * 100) : 0,
      };
    });
  }

  /**
   * Average days a deal spends in each stage before moving on (or "now" if
   * it's still there). Requires stage-history data.
   */
  async getStageVelocity(companyId: string): Promise<StageVelocityDTO[]> {
    const rows = await salesAnalyticsRepository.getStageVelocity(companyId);
    return rows.map((r) => ({
      stageId: r.stageId,
      stageName: r.stageName,
      avgDays: Math.round(r.avgDays * 10) / 10,
    }));
  }

  /**
   * Why deals are lost, grouped by the free-text `lostReason` field —
   * already collected today, never surfaced anywhere until now.
   */
  async getLostReasonBreakdown(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<LostReasonDTO[]> {
    const start = startDate || dayjs().subtract(90, "day").toDate();
    const end = endDate || new Date();

    const deals = await salesAnalyticsRepository.getClosedDealsInRange(
      companyId,
      start,
      end,
    );
    const lostDeals = deals.filter((d) => d.stage.isLost);

    const grouped = new Map<string, { count: number; value: number }>();
    for (const d of lostDeals) {
      const reason = d.lostReason?.trim() || "Sin especificar";
      const entry = grouped.get(reason) || { count: 0, value: 0 };
      entry.count++;
      entry.value += d.value;
      grouped.set(reason, entry);
    }

    const totalLost = lostDeals.length;
    return Array.from(grouped.entries())
      .map(([reason, { count, value }]) => ({
        reason,
        count,
        value,
        percentage: totalLost > 0 ? Math.round((count / totalLost) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Real per-rep ranking for the period: deals actually won/lost, not a
   * proxy score. Defaults to the current month.
   */
  async getRepLeaderboard(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<RepLeaderboardDTO[]> {
    const start = startDate || dayjs().startOf("month").toDate();
    const end = endDate || dayjs().endOf("month").toDate();

    const deals = await salesAnalyticsRepository.getClosedDealsInRange(
      companyId,
      start,
      end,
    );

    const grouped = new Map<
      string,
      { name: string; wonCount: number; wonValue: number; lostCount: number }
    >();

    for (const d of deals) {
      if (!d.assignedToId || !d.assignedTo) continue;
      const entry = grouped.get(d.assignedToId) || {
        name: d.assignedTo.name,
        wonCount: 0,
        wonValue: 0,
        lostCount: 0,
      };
      if (d.stage.isWon) {
        entry.wonCount++;
        entry.wonValue += d.value;
      } else if (d.stage.isLost) {
        entry.lostCount++;
      }
      grouped.set(d.assignedToId, entry);
    }

    return Array.from(grouped.entries())
      .map(([userId, e]) => {
        const closed = e.wonCount + e.lostCount;
        return {
          userId,
          name: e.name,
          wonCount: e.wonCount,
          wonValue: e.wonValue,
          lostCount: e.lostCount,
          conversionRate:
            closed > 0 ? Math.round((e.wonCount / closed) * 100) : 0,
        };
      })
      .sort((a, b) => b.wonValue - a.wonValue);
  }

  // --- EXPORT HELPERS ---

  async generateLeaderboardExport(
    companyId: string,
    filters: { startDate?: Date; endDate?: Date },
    format: string,
    userName: string,
  ): Promise<ExportResultDTO> {
    const start = filters.startDate || dayjs().startOf("month").toDate();
    const end = filters.endDate || dayjs().endOf("month").toDate();

    const data = await this.getRepLeaderboard(companyId, start, end);
    const company = await companyRepository.findById(companyId);

    const exportData = {
      headers: [
        { id: "name", title: "Vendedor" },
        { id: "wonCount", title: "Ganados" },
        { id: "wonValue", title: "Valor Ganado" },
        { id: "lostCount", title: "Perdidos" },
        { id: "conversionRate", title: "Tasa Conversión (%)" },
      ],
      records: data.map((d) => ({ ...d })),
      metadata: {
        title: "Ranking de Ventas por Vendedor",
        companyName: company?.name || "CRM",
        dateRange: `${dayjs(start).format("DD/MM/YYYY")} - ${dayjs(end).format("DD/MM/YYYY")}`,
        generatedBy: userName,
        totalRecords: data.length,
      },
    };

    const prefix = "sales_leaderboard";
    const result =
      format === "pdf"
        ? await exportService.generatePDF(companyId, exportData, prefix)
        : await exportService.generateCSV(companyId, exportData, prefix);
    return { downloadUrl: result.filePath, format, recordCount: data.length };
  }

  async generateLostReasonsExport(
    companyId: string,
    filters: { startDate?: Date; endDate?: Date },
    format: string,
    userName: string,
  ): Promise<ExportResultDTO> {
    const start = filters.startDate || dayjs().subtract(90, "day").toDate();
    const end = filters.endDate || new Date();

    const data = await this.getLostReasonBreakdown(companyId, start, end);
    const company = await companyRepository.findById(companyId);

    const exportData = {
      headers: [
        { id: "reason", title: "Motivo de Pérdida" },
        { id: "count", title: "Cantidad" },
        { id: "value", title: "Valor Perdido" },
        { id: "percentage", title: "% del Total" },
      ],
      records: data.map((d) => ({ ...d })),
      metadata: {
        title: "Análisis de Motivos de Pérdida",
        companyName: company?.name || "CRM",
        dateRange: `${dayjs(start).format("DD/MM/YYYY")} - ${dayjs(end).format("DD/MM/YYYY")}`,
        generatedBy: userName,
        totalRecords: data.length,
      },
    };

    const prefix = "lost_reasons";
    const result =
      format === "pdf"
        ? await exportService.generatePDF(companyId, exportData, prefix)
        : await exportService.generateCSV(companyId, exportData, prefix);
    return { downloadUrl: result.filePath, format, recordCount: data.length };
  }
}

export const salesAnalyticsService = new SalesAnalyticsService();
