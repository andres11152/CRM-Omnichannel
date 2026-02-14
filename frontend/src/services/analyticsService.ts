import { api } from "@/lib/axios";
import { HeatmapData, AgentStats, TagData, AnalyticsDateRange } from "@/types";

/**
 * Enterprise Service for Analytics Data
 * Centralizes all dashboard data fetching with strict typing.
 */

export const getHeatmapData = async (
  dateRange: AnalyticsDateRange,
): Promise<HeatmapData[]> => {
  const { startDate, endDate } = getDateRangeParams(dateRange);
  const query = `?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

  const res = await api.get(`/analytics/heatmap${query}`);
  // Ensure we return a clean array
  return Array.isArray(res.data.data) ? res.data.data : [];
};

export const getAgentPerformance = async (
  dateRange: AnalyticsDateRange,
): Promise<AgentStats[]> => {
  const { startDate, endDate } = getDateRangeParams(dateRange);
  const query = `?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

  const res = await api.get(`/analytics/agents${query}`);
  return Array.isArray(res.data.data) ? res.data.data : [];
};

export const getTagInsights = async (
  dateRange: AnalyticsDateRange,
): Promise<TagData[]> => {
  const { startDate, endDate } = getDateRangeParams(dateRange);
  const query = `?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

  const res = await api.get(`/analytics/tags${query}`);
  return Array.isArray(res.data.data) ? res.data.data : [];
};

/**
 * Helper to calculate date ranges for API queries.
 */
const getDateRangeParams = (range: AnalyticsDateRange) => {
  const endDate = new Date();
  const startDate = new Date();

  switch (range) {
    case "7d":
      startDate.setDate(endDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(endDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(endDate.getDate() - 90);
      break;
    default:
      startDate.setDate(endDate.getDate() - 30); // Fallback
  }

  return { startDate, endDate };
};

