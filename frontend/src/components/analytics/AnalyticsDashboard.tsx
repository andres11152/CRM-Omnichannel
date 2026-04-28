import React, { useState, useEffect, useMemo } from "react";
import { ModuleHeader } from "../common/ModuleHeader";
import { toast } from "sonner";
import { AnalyticsDateRange, HeatmapData, AgentStats, TagData } from "@/types";
import {
  getHeatmapData,
  getAgentPerformance,
  getTagInsights,
} from "@/services/analyticsService";
import { Activity, Ticket, CheckCircle2, Clock } from "lucide-react";

// Components
import { HeatmapChart } from "./HeatmapChart";
import { AgentPerformanceTable } from "./AgentPerformanceTable";
import { TagInsights } from "./TagInsights";

export const AnalyticsDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>("30d");
  const [loading, setLoading] = useState(true);

  // Strict Typed State
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [agentData, setAgentData] = useState<AgentStats[]>([]);
  const [tagData, setTagData] = useState<TagData[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [heatmap, agents, tags] = await Promise.all([
        getHeatmapData(dateRange),
        getAgentPerformance(dateRange),
        getTagInsights(dateRange),
      ]);

      setHeatmapData(heatmap);
      setAgentData(agents);
      setTagData(tags);
    } catch (error) {
      console.error("Analytics Error:", error);
      toast.error("Error cargando estadísticas. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  // Compute KPIs from agentData
  const kpis = useMemo(() => {
    let totalTickets = 0;
    let totalResolved = 0;
    let sumTime = 0;
    let agentsWithTime = 0;

    agentData.forEach((a) => {
      totalTickets += a.totalTickets || 0;
      totalResolved += a.resolvedTickets || 0;
      if (a.avgResolutionTime > 0) {
        sumTime += a.avgResolutionTime;
        agentsWithTime++;
      }
    });

    const avgTime = agentsWithTime > 0 ? Math.round(sumTime / agentsWithTime) : 0;
    const resolutionRate = totalTickets > 0 ? Math.round((totalResolved / totalTickets) * 100) : 0;

    return { totalTickets, totalResolved, avgTime, resolutionRate };
  }, [agentData]);

  return (
    <div className="flex flex-col bg-[#f8fafc] dark:bg-[#0b141a] min-h-screen transition-colors duration-200 font-sans">
      <ModuleHeader
        title="Analítica Avanzada"
        description="Insights operativos para optimizar tu equipo de soporte."
        icon={
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
        }
        gradient="from-blue-600 to-indigo-600"
        action={
          <div className="flex bg-white/20 backdrop-blur-sm rounded-lg p-1">
            {(["7d", "30d", "90d"] as AnalyticsDateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                  dateRange === range
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {range === "7d"
                  ? "7 Días"
                  : range === "30d"
                    ? "30 Días"
                    : "3 Meses"}
              </button>
            ))}
          </div>
        }
      />

      <div className="p-8 space-y-6 max-w-[1600px] mx-auto w-full">
        {loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800/50 rounded-2xl" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-96 bg-gray-200 dark:bg-gray-800/50 rounded-2xl" />
              <div className="h-96 bg-gray-200 dark:bg-gray-800/50 rounded-2xl" />
            </div>
            <div className="h-64 bg-gray-200 dark:bg-gray-800/50 rounded-2xl" />
          </div>
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-[#111b21] rounded-2xl p-6 border border-gray-100 dark:border-gray-800/60 shadow-sm flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Ticket className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Total Tickets</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{kpis.totalTickets}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#111b21] rounded-2xl p-6 border border-gray-100 dark:border-gray-800/60 shadow-sm flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Resueltos ({kpis.resolutionRate}%)</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{kpis.totalResolved}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#111b21] rounded-2xl p-6 border border-gray-100 dark:border-gray-800/60 shadow-sm flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Clock className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Tiempo de Resolución</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{kpis.avgTime}</p>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">min</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Heatmap takes 2/3 width */}
              <div className="lg:col-span-2">
                <HeatmapChart data={heatmapData} />
              </div>

              {/* Tag Insights takes 1/3 width */}
              <div>
                <TagInsights data={tagData} />
              </div>
            </div>

            {/* Agent Performance Table full width */}
            <div>
              <AgentPerformanceTable data={agentData} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
