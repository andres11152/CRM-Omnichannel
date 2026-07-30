import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "@/services/apiConfig";
import { ModuleHeader } from "./common/ModuleHeader";

export const SalesDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{
    forecast: number;
    pipelineValue: number;
    wonValue: number;
    wonCount: number;
    conversionRate: number;
    stalledDealsCount: number;
    overdueTasksCount: number;
    leaderboard: Array<{
      id: string;
      name: string;
      activities: number;
      dealsWon: number;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSalesStats = async () => {
      try {
        const { fetchAPI } = await import("../services/apiConfig");
        interface SalesStats {
          forecast: number;
          pipelineValue: number;
          wonValue: number;
          wonCount: number;
          conversionRate: number;
          stalledDealsCount: number;
          overdueTasksCount: number;
          leaderboard: Array<{
            id: string;
            name: string;
            activities: number;
            dealsWon: number;
          }>;
        }
        const data = await fetchAPI<{ data: SalesStats }>("/dashboard/sales-stats");
        setStats(data.data);
      } catch (error) {
        console.error("Error loading sales stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSalesStats();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-y-auto">
      <ModuleHeader
        title={t("sales.dashboard_title", "Panel de Ventas")}
        description={t("sales.dashboard_desc", "Métricas clave de rendimiento comercial y pipeline.")}
        icon={
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800"
      />

      <div className="p-4 space-y-4">
        {/* HEADLINE METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title={t("sales.forecast", "Pronóstico (Forecast)")}
            value={stats ? formatCurrency(stats.forecast) : "$0"}
            subtitle={t("sales.forecast_desc", "Ponderado por probabilidad")}
            icon=""
            color="text-emerald-600"
            bg="bg-emerald-100 dark:bg-emerald-900/30"
            isLoading={loading}
          />
          <StatCard
            title={t("sales.pipeline_value", "Valor en Pipeline")}
            value={stats ? formatCurrency(stats.pipelineValue) : "$0"}
            subtitle={t("sales.pipeline_desc", "Total abierto")}
            icon=""
            color="text-blue-600"
            bg="bg-blue-100 dark:bg-blue-900/30"
            isLoading={loading}
          />
          <StatCard
            title={t("sales.sales_month", "Ventas (Este Mes)")}
            value={stats ? formatCurrency(stats.wonValue) : "$0"}
            subtitle={t("sales.deals_closed", { count: stats?.wonCount || 0, defaultValue: "0 tratos cerrados" })}
            icon="[BILLING]"
            color="text-amber-600"
            bg="bg-amber-100 dark:bg-amber-900/30"
            isLoading={loading}
          />
          <StatCard
            title={t("sales.close_rate", "Tasa de Cierre")}
            value={stats ? `${stats.conversionRate}%` : "0%"}
            subtitle={t("sales.close_rate_desc", "Deals ganados vs perdidos")}
            icon=""
            color="text-purple-600"
            bg="bg-purple-100 dark:bg-purple-900/30"
            isLoading={loading}
          />
        </div>

        {/* MAIN CONTENT ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEADERBOARD */}
          <div className="lg:col-span-2 bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <span></span> {t("sales.leaderboard_title", "Ranking de Actividad (Este Mes)")}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-reply-bg dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2">{t("sales.agent", "Agente")}</th>
                    <th className="px-4 py-2 text-center">{t("sales.activities", "Actividades")}</th>
                    <th className="px-4 py-2 text-center">{t("sales.sales_col", "Ventas")}</th>
                    <th className="px-4 py-2 text-right">{t("sales.effectiveness", "Efectividad")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-4">
                        {t("common.loading", "Cargando...")}
                      </td>
                    </tr>
                  ) : stats?.leaderboard?.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-4 text-gray-500"
                      >
                        {t("sales.no_data", "No hay datos suficientes")}
                      </td>
                    </tr>
                  ) : (
                    stats?.leaderboard?.map((agent, index: number) => (
                      <tr
                        key={agent.id}
                        className="border-b dark:border-reply-border-dark hover:bg-reply-bg dark:hover:bg-gray-800/50"
                      >
                        <td className="px-4 py-2 flex items-center gap-3">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}
                          >
                            {index + 1}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {agent.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          {agent.activities}
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          {agent.dealsWon}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">
                          {agent.activities > 0
                            ? (
                                (agent.dealsWon / agent.activities) *
                                100
                              ).toFixed(1)
                            : 0}
                          %
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PIPELINE HEALTH / TIPS */}
          <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4">
              {t("sales.pipeline_health", "Salud del Pipeline")}
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm mb-1">
                   {t("sales.sales_tip", "Consejo de Venta")}
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  {t("sales.industry_avg_tip", {
                    rate: stats?.conversionRate || 0,
                    comparison: (stats?.conversionRate || 0) > 20 
                      ? t("sales.industry_avg_above", "por encima") 
                      : t("sales.industry_avg_below", "por debajo")
                  })}
                  {(stats?.conversionRate || 0) < 20 &&
                    t("sales.qualify_leads_tip", " Intenta calificar mejor a los leads antes de convertirlos en oportunidades.")}
                </p>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {t("sales.stagnant_deals", "Deals Estancados (>30 días)")}
                </span>
                <span className="font-bold text-red-500">
                  {stats?.stalledDealsCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{t("sales.overdue_tasks", "Tareas Vencidas")}</span>
                <span className="font-bold text-amber-500">
                  {stats?.overdueTasksCount ?? 0}
                </span>
              </div>

              <div className="mt-6 pt-6 border-t dark:border-reply-border-dark">
                <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg transition-colors">
                  {t("sales.go_to_pipeline", "Ir al Pipeline Kanban")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: string;
  bg: string;
  isLoading?: boolean;
}> = ({ title, value, subtitle, icon, color, bg, isLoading }) => (
  <div className="bg-reply-panel dark:bg-reply-panel-dark p-4 rounded-xl border border-reply-border dark:border-reply-border-dark shadow-sm flex flex-col justify-between gap-4">
    <div className="flex items-start justify-between">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${bg} ${color}`}
      >
        {icon}
      </div>
    </div>
    <div>
      {isLoading ? (
        <div className="animate-pulse h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
      ) : (
        <>
          <p className="text-3xl font-bold text-reply-text dark:text-reply-text-dark">
            {value}
          </p>
          <div className="flex flex-col">
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
            )}
          </div>
        </>
      )}
    </div>
  </div>
);
