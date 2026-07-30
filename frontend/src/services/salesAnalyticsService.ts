import { api } from "@/lib/axios";

export interface SalesForecast {
  period: { start: string; end: string };
  weightedForecast: number;
  openPipelineValue: number;
  dealCount: number;
}

export interface StageConversion {
  stageId: string;
  stageName: string;
  dealsEntered: number;
  dealsWon: number;
  conversionRate: number;
}

export interface StageVelocity {
  stageId: string;
  stageName: string;
  avgDays: number;
}

export interface LostReason {
  reason: string;
  count: number;
  value: number;
  percentage: number;
}

export interface RepLeaderboardEntry {
  userId: string;
  name: string;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  conversionRate: number;
}

export interface ExportResult {
  downloadUrl: string;
  format: string;
  recordCount: number;
}

export interface DealRisk {
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
  suggestedProbability: number | null;
}

const rangeQuery = (start?: Date, end?: Date) => {
  const params = new URLSearchParams();
  if (start) params.set("startDate", start.toISOString());
  if (end) params.set("endDate", end.toISOString());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export const getSalesForecast = async (
  start?: Date,
  end?: Date,
): Promise<SalesForecast> => {
  const res = await api.get(`/analytics/sales/forecast${rangeQuery(start, end)}`);
  return res.data.data;
};

export const getStageConversion = async (): Promise<StageConversion[]> => {
  const res = await api.get("/analytics/sales/stage-conversion");
  return Array.isArray(res.data.data) ? res.data.data : [];
};

export const getStageVelocity = async (): Promise<StageVelocity[]> => {
  const res = await api.get("/analytics/sales/stage-velocity");
  return Array.isArray(res.data.data) ? res.data.data : [];
};

export const getLostReasons = async (
  start?: Date,
  end?: Date,
): Promise<LostReason[]> => {
  const res = await api.get(`/analytics/sales/lost-reasons${rangeQuery(start, end)}`);
  return Array.isArray(res.data.data) ? res.data.data : [];
};

export const getRepLeaderboard = async (
  start?: Date,
  end?: Date,
): Promise<RepLeaderboardEntry[]> => {
  const res = await api.get(`/analytics/sales/leaderboard${rangeQuery(start, end)}`);
  return Array.isArray(res.data.data) ? res.data.data : [];
};

export const getDealRisk = async (): Promise<DealRisk[]> => {
  const res = await api.get("/analytics/sales/deal-risk");
  return Array.isArray(res.data.data) ? res.data.data : [];
};

export const exportLeaderboard = async (
  format: "csv" | "pdf",
  start?: Date,
  end?: Date,
): Promise<ExportResult> => {
  const qs = rangeQuery(start, end);
  const sep = qs ? "&" : "?";
  const res = await api.get(
    `/analytics/sales/export/leaderboard${qs}${sep}format=${format}`,
  );
  return res.data.data;
};

export const exportLostReasons = async (
  format: "csv" | "pdf",
  start?: Date,
  end?: Date,
): Promise<ExportResult> => {
  const qs = rangeQuery(start, end);
  const sep = qs ? "&" : "?";
  const res = await api.get(
    `/analytics/sales/export/lost-reasons${qs}${sep}format=${format}`,
  );
  return res.data.data;
};
