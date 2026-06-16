import React from "react";
import { Company, CompanyStatus, Plan } from "@/types";
import {
  Edit,
  Eye,
  BarChart3,
  Building2,
  Calendar,
  ShieldAlert,
  Zap,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  companies: Company[];
  plans?: Plan[];
  onStatusChange: (id: string, status: CompanyStatus) => void;
  onImpersonate: (id: string) => void;
  onViewMetrics: (id: string) => void;
  onEdit: (company: Company) => void;
}

export const AdminTenantTable: React.FC<Props> = ({
  companies,
  plans,
  onStatusChange,
  onImpersonate,
  onViewMetrics,
  onEdit,
}) => {
  const { t } = useTranslation();

  const getStatusBadge = (status: CompanyStatus) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
            <CheckCircle2 className="w-3 h-3" />{" "}
            {t("admin_tenants.active", "ACTIVO")}
          </span>
        );
      case "TRIAL":
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
            <Clock className="w-3 h-3" /> {t("admin_tenants.trial", "PRUEBA")}
          </span>
        );
      case "OVERDUE":
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
            <AlertTriangle className="w-3 h-3" />{" "}
            {t("admin_tenants.overdue", "VENCIDO")}
          </span>
        );
      case "BANNED":
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/50">
            <Ban className="w-3 h-3" /> {t("admin_tenants.banned", "BLOQUEADO")}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200 uppercase">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-xl overflow-hidden backdrop-blur-md bg-opacity-80">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="bg-gray-50/50 dark:bg-reply-surface-dark/50 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-reply-border-dark uppercase tracking-wider text-[10px]">
            <th className="px-8 py-2.5">
              {t("admin_tenants.table_company", "Empresa / Dominio")}
            </th>
            <th className="px-6 py-2.5">
              {t("admin_tenants.table_plan", "Plan & Facturación")}
            </th>
            <th className="px-6 py-2.5">
              {t("admin_tenants.table_status", "Estado Operativo")}
            </th>
            <th className="px-6 py-2.5">
              {t("admin_tenants.table_cycle", "Ciclo de Renovación")}
            </th>
            <th className="px-8 py-2.5 text-right">
              {t("admin_tenants.table_actions", "Acciones de Control")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {companies.map((company) => (
            <tr
              key={company.id}
              className="group hover:bg-reply-bg/50 dark:hover:bg-reply-bg-dark/50 transition-all duration-200"
            >
              <td className="px-8 py-3">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img
                      src={
                        company.logoUrl ||
                        `https://ui-avatars.com/api/?name=${company.name.replace(/\s+/g, "+")}&background=random&color=fff`
                      }
                      alt="Logo"
                      className="w-10 h-10 rounded-xl object-cover shadow-sm group-hover:scale-105 transition-transform border border-gray-100 dark:border-gray-700"
                    />
                    <div
                      className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-reply-panel-dark ${company.isActive ? "bg-green-500" : "bg-gray-400"}`}
                    />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {company.name}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1 font-mono">
                      <span className="opacity-50">reply.com/</span>
                      {company.slug}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-3">
                <div className="flex flex-col gap-1">
                  {(() => {
                    const plan = plans?.find((p) => p.id === company.planId);
                    const planName = plan?.name?.toLowerCase() || company.planId?.toLowerCase() || "free";
                    
                    let badgeClass = "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
                    if (planName.includes("starter")) {
                      badgeClass = "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800";
                    } else if (planName.includes("growth")) {
                      badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800";
                    } else if (planName.includes("pro")) {
                      badgeClass = "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
                    } else if (planName.includes("enterprise")) {
                      badgeClass = "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800";
                    } else if (planName.includes("ultimate")) {
                      badgeClass = "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50 font-black";
                    }
                    
                    return (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] uppercase tracking-tighter border ${badgeClass}`}>
                        <Zap className="w-2.5 h-2.5" />
                        {plan?.name || company.planId || t("admin_tenants.plan_free", "Plan Free")}
                      </span>
                    );
                  })()}
                  <div className="text-[10px] text-gray-400 font-medium">
                    ${plans?.find((p) => p.id === company.planId)?.price || 0}
                    {t("admin_tenants.per_month", "/mes")}
                  </div>
                </div>
              </td>
              <td className="px-6 py-3">
                <div className="relative inline-block group/select">
                  <select
                    value={company.status}
                    onChange={(e) =>
                      onStatusChange(
                        company.id,
                        e.target.value as CompanyStatus,
                      )
                    }
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                    aria-label={`Estado de ${company.name}`}
                  >
                    <option value="ACTIVE">
                      {t("dashboard.status.active", "Activo")}
                    </option>
                    <option value="TRIAL">
                      {t("dashboard.status.trial", "Prueba")}
                    </option>
                    <option value="INACTIVE">
                      {t("dashboard.status.inactive", "Inactivo")}
                    </option>
                    <option value="OVERDUE">
                      {t("admin_tenants.overdue", "Vencido")}
                    </option>
                    <option value="BANNED">
                      {t("admin_tenants.banned", "BLOQUEADO")}
                    </option>
                  </select>
                  <div className="group-hover/select:opacity-80 transition-opacity">
                    {getStatusBadge(company.status)}
                  </div>
                </div>
              </td>
              <td className="px-6 py-3">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Calendar className="w-3.5 h-3.5 opacity-50" />
                  <span className="font-mono">
                    {company.subscriptionEndsAt
                      ? new Date(
                          company.subscriptionEndsAt,
                        ).toLocaleDateString()
                      : t("admin_tenants.permanent", "Permanente")}
                  </span>
                </div>
              </td>
              <td className="px-8 py-3 text-right">
                <div className="flex justify-end items-center gap-1.5">
                  <button
                    onClick={() => onImpersonate(company.id)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 rounded-lg transition-all"
                    title={t(
                      "admin_tenants.impersonate",
                      "Impersonar (Soporte)",
                    )}
                  >
                    <Eye className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => onViewMetrics(company.id)}
                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 rounded-lg transition-all"
                    title={t(
                      "admin_tenants.metrics_dashboard",
                      "Dashboard de Métricas",
                    )}
                  >
                    <BarChart3 className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => onEdit(company)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 rounded-lg transition-all"
                    title={t("admin_tenants.settings", "Configuración")}
                  >
                    <Edit className="w-4.5 h-4.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {companies.length === 0 && (
        <div className="p-20 text-center flex flex-col items-center gap-4">
          <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-700" />
          <div className="text-gray-500 font-medium">
            {t(
              "admin_tenants.no_companies_found",
              "No se encontraron empresas con esos criterios.",
            )}
          </div>
        </div>
      )}
    </div>
  );
};
