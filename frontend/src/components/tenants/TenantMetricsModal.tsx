import React from "react";
import { useTranslation } from "react-i18next";
import { Company } from "@/types";
import { CompanyMetrics } from "@/services/adminService";
import { 
  DollarSign, 
  BarChart3, 
  TrendingUp, 
  Brain, 
  Users, 
  MessageSquare, 
  Percent, 
  Clock, 
  Calendar, 
  Activity, 
  ShieldCheck,
  Zap,
  Globe
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  company: Company | null;
  metrics: CompanyMetrics | null;
  loading: boolean;
}

export const TenantMetricsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  company,
  metrics,
  loading,
}) => {
  const { t } = useTranslation();
  if (!isOpen || !company) return null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-150 dark:border-reply-border-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 px-6 py-5 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-white/95 dark:bg-reply-panel-dark/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Globe className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-2xl text-gray-800 dark:text-white tracking-tight">
                {company.name}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                {t("tenants.metrics.full_dashboard", "Dashboard de Métricas Completo")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-2xl font-semibold leading-none"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="p-16 text-center text-gray-500">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600/30 border-t-indigo-600 mx-auto mb-4"></div>
            <p className="font-medium text-gray-600 dark:text-gray-400">
              {t("tenants.metrics.loading", "Cargando métricas completas...")}
            </p>
          </div>
        ) : metrics ? (
          <div className="p-6 space-y-6 animate-fade-in">
            {/* Business Metrics */}
            <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/20 dark:from-emerald-950/10 dark:to-teal-950/5 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-2 bg-emerald-100/60 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                  {t("tenants.metrics.business_metrics", "Métricas de Negocio")}
                </h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label={t("tenants.metrics.mrr", "MRR")} value={`$${metrics.business?.mrr || 0}`} sub={t("tenants.metrics.monthly_revenue", "Ingreso Mensual")} color="text-emerald-600 dark:text-emerald-400" icon={<DollarSign className="w-4 h-4 text-emerald-500" />} />
                <MetricCard label={t("tenants.metrics.plan", "Plan")} value={metrics.business?.plan?.name || "N/A"} sub={`$${metrics.business?.plan?.price || 0}${t("tenants.metrics.per_month", "/mes")}`} icon={<ShieldCheck className="w-4 h-4 text-blue-500" />} />
                <MetricCard label={t("tenants.metrics.status", "Estado")} value={metrics.business?.status || "N/A"} sub={metrics.business?.isActive ? t("tenants.metrics.active", "Activo") : t("tenants.metrics.inactive", "Inactivo")} icon={<Activity className="w-4 h-4 text-indigo-500" />} />
                <MetricCard label={t("tenants.metrics.renewal", "Renovación")} value={metrics.business?.daysUntilRenewal !== null ? `${metrics.business.daysUntilRenewal}d` : "N/A"} sub={t("tenants.metrics.days_remaining", "Días restantes")} icon={<Calendar className="w-4 h-4 text-purple-500" />} />
              </div>
            </div>

            {/* Usage Metrics */}
            <div className="bg-gradient-to-br from-indigo-50/40 to-blue-50/20 dark:from-indigo-950/10 dark:to-blue-950/5 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-2 bg-indigo-100/60 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-lg text-gray-800 dark:text-white">{t("tenants.metrics.system_usage", "Uso del Sistema")}</h4>
              </div>
              <div className="space-y-4">
                <ProgressBar label={t("tenants.metrics.users_agents", "Usuarios / Agentes")} current={metrics.usage?.users?.current} limit={metrics.usage?.users?.limit} percentage={metrics.usage?.users?.percentage} color="bg-indigo-600 dark:bg-indigo-500" />
                <ProgressBar label={t("tenants.metrics.active_whatsapp", "WhatsApp Activo")} current={metrics.usage?.whatsapp?.current} limit={metrics.usage?.whatsapp?.limit} percentage={metrics.usage?.whatsapp?.percentage} color="bg-emerald-500 dark:bg-emerald-400" />
                <ProgressBar label={t("tenants.metrics.support_queues", "Colas de Atención")} current={metrics.usage?.queues?.current} limit={metrics.usage?.queues?.limit} percentage={metrics.usage?.queues?.percentage} color="bg-purple-500" />
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-white dark:bg-gray-800/80 p-4 rounded-xl border border-gray-150 dark:border-gray-700/60 shadow-sm">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t("tenants.metrics.tickets_this_month", "Tickets Este Mes")}</div>
                    <div className="text-2xl font-extrabold text-gray-800 dark:text-white">{metrics.usage?.tickets?.thisMonth || 0}</div>
                    <div className={`text-xs font-semibold mt-1 flex items-center gap-1 ${(metrics.usage?.tickets?.growth || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                      {(metrics.usage?.tickets?.growth || 0) >= 0 ? "↑" : "↓"} {Math.abs(metrics.usage?.tickets?.growth || 0)}% <span className="text-gray-400 font-normal">{t("tenants.metrics.vs_previous", "vs mes anterior")}</span>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800/80 p-4 rounded-xl border border-gray-150 dark:border-gray-700/60 shadow-sm">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t("tenants.metrics.ai_assistants", "Asistentes IA")}</div>
                    <div className="text-2xl font-extrabold text-gray-800 dark:text-white">{metrics.usage?.aiAssistants?.current || 0}</div>
                    <div className="text-xs text-gray-400 mt-1 font-medium">{t("tenants.metrics.allowed", { limit: metrics.usage?.aiAssistants?.limit || 0, defaultValue: `de ${metrics.usage?.aiAssistants?.limit || 0} permitidos` })}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Engagement & AI Performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Engagement */}
              <div className="bg-white dark:bg-gray-800/40 p-6 rounded-2xl border border-purple-100 dark:border-purple-900/20 shadow-sm">
                <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <div className="p-1.5 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-md">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  {t("tenants.metrics.engagement", "Engagement")}
                </h4>
                <div className="grid grid-cols-2 gap-3.5">
                   <div className="col-span-2 bg-gray-50/80 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800/40">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t("tenants.metrics.last_admin_login", "Último Login Admin")}</div>
                      <div className="text-sm font-bold text-gray-800 dark:text-gray-200">
                        {metrics.engagement?.lastAdminLogin ? new Date(metrics.engagement.lastAdminLogin).toLocaleDateString() : t("tenants.metrics.never", "Nunca")}
                      </div>
                   </div>
                   <SmallStatCard label={t("tenants.metrics.project_convs", "Convs. Proyecto")} value={metrics.engagement?.conversationsThisMonth || 0} color="text-purple-600 dark:text-purple-400" icon={<MessageSquare className="w-3.5 h-3.5 text-purple-500" />} />
                   <SmallStatCard label={t("tenants.metrics.total_messages", "Mensajes Totales")} value={metrics.engagement?.messagesThisMonth || 0} color="text-pink-600 dark:text-pink-400" icon={<Zap className="w-3.5 h-3.5 text-pink-500" />} />
                </div>
              </div>

              {/* AI performance */}
              <div className="bg-white dark:bg-gray-800/40 p-6 rounded-2xl border border-cyan-100 dark:border-cyan-900/20 shadow-sm">
                <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <div className="p-1.5 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 rounded-md">
                    <Brain className="w-4 h-4" />
                  </div>
                  {t("tenants.metrics.ai_performance", "Rendimiento IA")}
                </h4>
                <div className="grid grid-cols-2 gap-3.5">
                   <div className="col-span-2 bg-gray-50/80 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800/40 text-center flex flex-col items-center justify-center">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t("tenants.metrics.resolution_rate", "Tasa de Resolución")}</div>
                      <div className="text-4xl font-extrabold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                        {metrics.ai?.resolutionRate || 0}%
                        <Percent className="w-5 h-5 text-cyan-400/80" />
                      </div>
                   </div>
                   <SmallStatCard label={t("tenants.metrics.tickets_resolved", "Tickets Resueltos")} value={metrics.ai?.ticketsResolved || 0} icon={<ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />} />
                   <SmallStatCard label={t("tenants.metrics.time_resolved", "Tiem. Resueltos")} value={formatTime(metrics.ai?.avgResolutionTimeSeconds || 0)} icon={<Clock className="w-3.5 h-3.5 text-cyan-500" />} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">{t("tenants.metrics.error_loading", "No se pudieron cargar las métricas.")}</div>
        )}
      </div>
    </div>
  );
};

// Helper Components
interface MetricCardProps {
  label: string;
  value: string | number;
  sub: string;
  color?: string;
  icon?: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, sub, color, icon }) => {
  return (
    <div className="bg-white dark:bg-gray-800/90 p-4.5 rounded-xl shadow-sm border border-gray-150 dark:border-gray-700/60 transition-all hover:shadow-md duration-300">
      <div className="flex justify-between items-start mb-1.5">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</span>
        {icon && <div className="opacity-80">{icon}</div>}
      </div>
      <div className={`text-2xl font-extrabold tracking-tight ${color || "text-gray-800 dark:text-white"}`}>{value}</div>
      <div className="text-xs text-gray-450 dark:text-gray-500 font-medium mt-0.5">{sub}</div>
    </div>
  );
};

interface ProgressBarProps {
  label: string;
  current?: number;
  limit?: number;
  percentage?: number;
  color: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, current, limit, percentage, color }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-white dark:bg-gray-800/80 p-5 rounded-xl border border-gray-150 dark:border-gray-700/60 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{label}</span>
        <span className="text-sm font-extrabold text-gray-900 dark:text-white">{current || 0} / {limit || 0}</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${Math.min(percentage || 0, 100)}%` }}></div>
      </div>
      <div className="text-right text-[10px] font-semibold text-gray-400 dark:text-gray-500 mt-1.5 uppercase tracking-wider">
        {t("tenants.metrics.capacity", { percentage: percentage || 0, defaultValue: `${percentage || 0}% de capacidad` })}
      </div>
    </div>
  );
};

interface SmallStatCardProps {
  label: string;
  value: string | number;
  color?: string;
  icon?: React.ReactNode;
}

const SmallStatCard: React.FC<SmallStatCardProps> = ({ label, value, color, icon }) => {
  return (
    <div className="bg-gray-50/80 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800/40 transition-all hover:bg-gray-100/50 dark:hover:bg-gray-900/60 duration-200 flex items-center justify-between">
      <div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1 font-bold">{label}</div>
        <div className={`text-lg font-extrabold tracking-tight ${color || "text-gray-850 dark:text-gray-200"}`}>{value}</div>
      </div>
      {icon && <div className="p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">{icon}</div>}
    </div>
  );
};
