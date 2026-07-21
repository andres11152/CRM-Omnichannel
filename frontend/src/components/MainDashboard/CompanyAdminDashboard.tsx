import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { User } from "@/types";
import { TicketsKanbanView } from "../TicketsKanbanView";
import {
  SalesFunnelWidget,
  ActiveLoadChart,
  AgentLeaderboardWidget,
  ChannelDistributionWidget,
} from "../DashboardWidgets";
import { MessageSquare, Zap, Clock, Bot, Shield, Check, X, ArrowRight, Activity, TrendingUp } from "lucide-react";
import { api } from "@/lib/axios";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

interface DashboardMetrics {
  activeTickets: number;
  totalMessages: number;
  activeConversations: number;
  aiResolution: string;
  avgResponseTime: string;
}

interface UsageMetric {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

interface PlanFeature {
  label: string;
  enabled: boolean;
  icon: string;
}

interface DashboardPlan {
  name: string;
  price?: number;
  usage: UsageMetric[];
  features?: PlanFeature[];
  expiresAt?: string;
  trialEndsAt?: string;
  status?: string;
  isActive?: boolean;
}

interface DashboardData {
  metrics: DashboardMetrics;
  plan: DashboardPlan;
  salesFunnel?: { name: string; count: number; value: number; color?: string }[];
  agentWorkload?: { name: string; pending: number; inProgress: number }[];
  channelDistribution?: { name: string; percentage: number; color?: string; iconClass?: string }[];
  topAgents?: { name: string; score: number; sales: number; avatar?: string }[];
}

const StatusBadge: React.FC<{ status?: string; isActive?: boolean }> = ({ status }) => {
  const { t } = useTranslation();
  const statusMap: Record<string, { label: string; color: string }> = {
    ACTIVE: { label: t("dashboard.status.active", "Activo"), color: "bg-emerald-500" },
    TRIAL: { label: t("dashboard.status.trial", "Prueba"), color: "bg-amber-500" },
    SUSPENDED: { label: t("dashboard.status.suspended", "Suspendido"), color: "bg-rose-500" },
    INACTIVE: { label: t("dashboard.status.inactive", "Inactivo"), color: "bg-slate-500" },
  };
  const info = statusMap[status || "INACTIVE"] || statusMap.INACTIVE;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${info.color} text-white`}>
      {info.label}
    </span>
  );
};

export const CompanyAdminDashboard: React.FC<{
  onNavigate?: (tab: string) => void;
  user?: User;
  onUserUpdate?: (user: Partial<User>) => void;
}> = ({ onNavigate, user }) => {
  // Stale-while-revalidate: instant render on module re-entry, silent refetch
  const cachedData = getModuleCache<DashboardData>("dashboard:company-admin");
  const [data, setData] = useState<DashboardData | null>(cachedData ?? null);
  const [loading, setLoading] = useState(!cachedData);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get("/dashboard/stats");
        const fresh: DashboardData =
          response.data && response.data.data ? response.data.data : response.data;
        setData(fresh);
        setModuleCache("dashboard:company-admin", fresh);
      } catch (error) {
        console.error("Failed to fetch dashboard stats", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const getUsagePercent = (used: number, limit: number) => {
    if (limit === -1) return 0;
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const isPlanActive =
    data?.plan?.isActive ??
    (data?.plan?.status === "ACTIVE" || data?.plan?.status === "TRIAL");

  const todayDate = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const getUsageColor = (pct: number) => {
    if (pct > 90) return "bg-rose-500";
    if (pct > 75) return "bg-amber-400";
    return "bg-emerald-500";
  };

  const getUsageTextColor = (pct: number) => {
    if (pct > 90) return "text-rose-400";
    if (pct > 75) return "text-amber-400";
    return "text-emerald-400";
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden font-sans">
      <div className="bg-white dark:bg-reply-surface-dark border-b border-slate-200 dark:border-reply-border-dark px-4 sm:px-8 py-4 sm:py-6 shadow-sm z-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
              {t("dashboard.navigation.dashboard", "Panel de Control")}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {user?.name
                ? t("dashboard.welcome_admin", { name: user.name, defaultValue: `Bienvenido, ${user.name}. Aquí tienes la visión general de tu negocio.` })
                : t("dashboard.welcome_admin_generic", "Bienvenido. Aquí tienes la visión general de tu negocio.")
              }
            </p>
          </div>
          <div className="shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-reply-border-dark">
              <Activity className="w-4 h-4 text-blue-500 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 lowercase first-letter:uppercase whitespace-nowrap">
                {todayDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 sm:p-6 text-white shadow-lg shadow-blue-900/20 relative overflow-hidden group hover:shadow-xl transition-all flex flex-col h-full">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="absolute top-1/2 right-0 transform -translate-y-1/2 p-4 opacity-10 group-hover:opacity-20 transition-all duration-500 group-hover:scale-110">
              <MessageSquare className="w-24 h-24 text-white" />
            </div>

            <div className="relative z-10 flex-1 flex flex-col">
              <div className="flex items-center gap-2 opacity-90 mb-2">
                <MessageSquare className="w-5 h-5" />
                <span className="text-sm font-medium uppercase tracking-wide">
                  {t("dashboard.tickets_active", "Tickets Activos")}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">
                  {loading ? "-" : data?.metrics?.activeTickets || 0}
                </span>
                <span className="text-sm opacity-80">{t("dashboard.pending", "pendientes")}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-white/20">
                <div>
                  <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5 tracking-wider">{t("dashboard.conversations", "Conversaciones")}</p>
                  <p className="font-mono text-lg font-semibold flex items-center gap-1">
                    {data?.metrics?.activeConversations || 0}
                    <Activity className="w-3 h-3 opacity-50" />
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5 tracking-wider">{t("dashboard.msgs_today", "Msjs Hoy")}</p>
                  <p className="font-mono text-lg font-semibold flex items-center gap-1">
                    {data?.metrics?.totalMessages || 0}
                    <Zap className="w-3 h-3 opacity-50" />
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-reply-border-dark shadow-sm hover:border-amber-400/50 transition-colors group flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                KPI
              </span>
            </div>

            <div className="flex-1 flex flex-col">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.response_time", "Tiempo Respuesta")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {loading ? "..." : data?.metrics?.avgResponseTime || "0s"}
                </span>
              </div>
              <div className="mt-auto pt-4">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  {t("dashboard.avg_7_days", "Promedio últimos 7 días")}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-reply-border-dark shadow-sm hover:border-purple-400/50 transition-colors group flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400">
                <Zap className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                KPI
              </span>
            </div>

            <div className="flex-1 flex flex-col">
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.ai_resolution", "Resolución IA")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {loading ? "..." : data?.metrics?.aiResolution || "0%"}
                </span>
              </div>
              <div className="mt-auto pt-4">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  {t("dashboard.closed_auto", "Cerrados automáticamente")}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 dark:from-[#162028] dark:to-[#0f161b] rounded-2xl p-5 text-white shadow-lg border border-slate-700 relative overflow-hidden flex flex-col h-full">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>

            <div className="flex justify-between items-start mb-3 relative z-10 shrink-0">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">
                  {t("dashboard.current_plan", "Tu Plan Actual")}
                </p>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  {data?.plan?.name || t("dashboard.starter", "Starter")}
                  <StatusBadge
                    status={data?.plan?.status}
                    isActive={isPlanActive}
                  />
                </h3>
                {data?.plan?.price !== undefined && data.plan.price > 0 && (
                  <p className="text-emerald-400 text-xs font-semibold mt-0.5">
                    ${data.plan.price.toLocaleString()}/mes
                  </p>
                )}
              </div>
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>

            {data?.plan?.features && data.plan.features.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 shrink-0 relative z-10">
                {data.plan.features.map((feat, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${feat.enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}
                  >
                    {feat.enabled ? (
                      <Check className="w-2.5 h-2.5" />
                    ) : (
                      <X className="w-2.5 h-2.5" />
                    )}
                    {feat.label}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 relative z-10 overflow-y-auto custom-scrollbar flex-1 pr-1 max-h-[200px]">
              {data?.plan?.usage?.map((metric, idx) => {
                const pct = getUsagePercent(metric.used, metric.limit);
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-slate-300">{metric.label}</span>
                      <span
                        className={`font-mono ${metric.limit !== -1 && pct > 75 ? getUsageTextColor(pct) : "text-white opacity-80"}`}
                      >
                        {metric.used.toLocaleString()} /{" "}
                        {metric.limit === -1
                          ? "∞"
                          : metric.limit.toLocaleString()}{" "}
                        <span className="text-[9px] opacity-50 ml-0.5">
                          {metric.unit}
                        </span>
                      </span>
                    </div>
                    <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getUsageColor(pct)}`}
                        style={{
                          width:
                            metric.limit === -1 ? "5%" : `${Math.max(pct, 2)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              }) || (
                <div className="text-sm text-slate-500 italic">
                  {t("dashboard.loading_metrics", "Cargando métricas...")}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
              <span>
                {data?.plan?.trialEndsAt ? (
                  <>
                    {t("dashboard.trial_until", "Prueba hasta:")}{" "}
                    <strong className="text-amber-400 ml-1">
                      {new Date(data.plan.trialEndsAt).toLocaleDateString(
                        i18n.language,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </strong>
                  </>
                ) : data?.plan?.expiresAt ? (
                  <>
                    {t("dashboard.renews", "Renueva:")}{" "}
                    <strong className="text-white ml-1">
                      {new Date(data.plan.expiresAt).toLocaleDateString(
                        i18n.language,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </strong>
                  </>
                ) : (
                  <>{t("dashboard.no_expiry", "Sin caducidad")}</>
                )}
              </span>
              <button
                onClick={() => onNavigate?.("settings")}
                className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium cursor-pointer text-[10px] uppercase tracking-wide flex items-center gap-1"
              >
                {t("dashboard.manage", "Gestionar")} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
            <div className="h-[360px]">
              <SalesFunnelWidget data={data?.salesFunnel} />
            </div>

            <div className="h-[360px]">
              <ActiveLoadChart data={data?.agentWorkload} />
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="h-[360px]">
              <ChannelDistributionWidget channels={data?.channelDistribution} />
            </div>

            <div className="h-[360px]">
              <AgentLeaderboardWidget agents={data?.topAgents} />
            </div>
          </div>
        </div>

        <div className="flex flex-col h-[550px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              {t("dashboard.tickets_in_progress", "Gestión de Tickets en Curso")}
            </h2>
            <div className="flex gap-2 text-sm text-slate-500 dark:text-slate-400">
               {t("dashboard.quick_view_load", "Vista rápida de la carga actual del equipo")}
            </div>
          </div>

          <div className="flex-1 bg-slate-100 dark:bg-[#162028] rounded-xl border border-slate-200 dark:border-reply-border-dark overflow-hidden shadow-inner">
            <TicketsKanbanView />
          </div>
        </div>
      </div>
    </div>
  );
};
