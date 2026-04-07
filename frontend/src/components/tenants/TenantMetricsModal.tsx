import React from "react";
import { Company } from "@/types";
import { CompanyMetrics } from "@/services/adminService";

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
  if (!isOpen || !company) return null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-reply-border-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center bg-white dark:bg-reply-panel-dark z-10">
          <div>
            <h3 className="font-bold text-xl text-gray-800 dark:text-white">
              {company.name}
            </h3>
            <p className="text-sm text-gray-500">Dashboard de Métricas Completo</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            Cargando métricas completas...
          </div>
        ) : metrics ? (
          <div className="p-6 space-y-6 animate-fade-in">
            {/* Business Metrics */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 p-5 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">[BILLING]</span>
                <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                  Métricas de Negocio
                </h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="MRR" value={`$${metrics.business?.mrr || 0}`} sub="Ingreso Mensual" color="text-green-600" />
                <MetricCard label="Plan" value={metrics.business?.plan?.name || "N/A"} sub={`$${metrics.business?.plan?.price || 0}/mes`} />
                <MetricCard label="Estado" value={metrics.business?.status || "N/A"} sub={metrics.business?.isActive ? "Activo" : "Inactivo"} />
                <MetricCard label="Renovación" value={metrics.business?.daysUntilRenewal !== null ? `${metrics.business.daysUntilRenewal}d` : "N/A"} sub="Días restantes" />
              </div>
            </div>

            {/* Usage Metrics */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 p-5 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">[STAT]</span>
                <h4 className="font-bold text-lg text-gray-800 dark:text-white">Uso del Sistema</h4>
              </div>
              <div className="space-y-4">
                <ProgressBar label="Usuarios / Agentes" current={metrics.usage?.users?.current} limit={metrics.usage?.users?.limit} percentage={metrics.usage?.users?.percentage} color="bg-indigo-600" />
                <ProgressBar label="WhatsApp Activo" current={metrics.usage?.whatsapp?.current} limit={metrics.usage?.whatsapp?.limit} percentage={metrics.usage?.whatsapp?.percentage} color="bg-green-500" />
                <ProgressBar label="Colas de Atención" current={metrics.usage?.queues?.current} limit={metrics.usage?.queues?.limit} percentage={metrics.usage?.queues?.percentage} color="bg-purple-500" />
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className="text-sm text-gray-500 mb-1">Tickets Este Mes</div>
                    <div className="text-2xl font-bold">{metrics.usage?.tickets?.thisMonth || 0}</div>
                    <div className={`text-xs font-medium ${(metrics.usage?.tickets?.growth || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {(metrics.usage?.tickets?.growth || 0) >= 0 ? "↑" : "↓"} {Math.abs(metrics.usage?.tickets?.growth || 0)}% vs mes anterior
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className="text-sm text-gray-500 mb-1">Asistentes IA</div>
                    <div className="text-2xl font-bold">{metrics.usage?.aiAssistants?.current || 0}</div>
                    <div className="text-xs text-gray-400">de {metrics.usage?.aiAssistants?.limit || 0} permitidos</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Engagement & AI Performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Engagement */}
              <div className="bg-white dark:bg-gray-800/50 p-5 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <h4 className="font-bold mb-4 flex items-center gap-2"> Engagement</h4>
                <div className="grid grid-cols-2 gap-3">
                   <div className="col-span-2 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg">
                      <div className="text-xs text-secondary mb-1">Último Login Admin</div>
                      <div className="text-sm font-bold">
                        {metrics.engagement?.lastAdminLogin ? new Date(metrics.engagement.lastAdminLogin).toLocaleDateString() : "Nunca"}
                      </div>
                   </div>
                   <SmallStatCard label="Convs. Proyecto" value={metrics.engagement?.conversationsThisMonth || 0} color="text-purple-600" />
                   <SmallStatCard label="Mensajes Totales" value={metrics.engagement?.messagesThisMonth || 0} color="text-pink-600" />
                </div>
              </div>

              {/* AI performance */}
              <div className="bg-white dark:bg-gray-800/50 p-5 rounded-xl border border-cyan-100 dark:border-cyan-900/30">
                <h4 className="font-bold mb-4 flex items-center gap-2">[AI] Rendimiento IA</h4>
                <div className="grid grid-cols-2 gap-3">
                   <div className="col-span-2 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg text-center">
                      <div className="text-xs text-secondary mb-1">Tasa de Resolución</div>
                      <div className="text-4xl font-extrabold text-cyan-500">{metrics.ai?.resolutionRate || 0}%</div>
                   </div>
                   <SmallStatCard label="Tickets Resueltos" value={metrics.ai?.ticketsResolved || 0} />
                   <SmallStatCard label="Tiem. Resueltos" value={formatTime(metrics.ai?.avgResolutionTimeSeconds || 0)} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">No se pudieron cargar las métricas.</div>
        )}
      </div>
    </div>
  );
};

// Helper Components
const MetricCard = ({ label, value, sub, color }: any) => (
  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
    <div className="text-sm text-gray-500 mb-1">{label}</div>
    <div className={`text-2xl font-bold ${color || "text-gray-800 dark:text-white"}`}>{value}</div>
    <div className="text-xs text-gray-400">{sub}</div>
  </div>
);

const ProgressBar = ({ label, current, limit, percentage, color }: any) => (
  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
    <div className="flex justify-between items-center mb-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm font-bold">{current || 0} / {limit || 0}</span>
    </div>
    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
      <div className={`${color} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${Math.min(percentage || 0, 100)}%` }}></div>
    </div>
    <div className="text-right text-[10px] text-gray-400 mt-1">{percentage || 0}% de capacidad</div>
  </div>
);

const SmallStatCard = ({ label, value, color }: any) => (
  <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg">
    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">{label}</div>
    <div className={`text-lg font-bold ${color || "text-gray-700 dark:text-gray-200"}`}>{value}</div>
  </div>
);
