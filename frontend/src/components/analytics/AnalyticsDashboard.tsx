import React, { useState, useEffect } from "react";
import { ModuleHeader } from "../common/ModuleHeader";
import { toast } from "sonner";
import { AnalyticsDateRange, HeatmapData, AgentStats, TagData } from "@/types";
import {
  getHeatmapData,
  getAgentPerformance,
  getTagInsights,
} from "@/services/analyticsService";

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

  return (
    <div className="flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200 font-sans">
      <ModuleHeader
        title="Analítica Avanzada"
        description="Insights operativos para optimizar tu equipo de soporte."
        icon={<span className="text-2xl">[STAT]</span>}
        gradient="from-blue-600 to-cyan-600"
        action={
          <div className="flex bg-white/20 backdrop-blur-sm rounded-lg p-0.5">
            {(["7d", "30d", "90d"] as AnalyticsDateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
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

      <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="h-96 flex items-center justify-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
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
