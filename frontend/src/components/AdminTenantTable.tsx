import React from "react";
import { Company, CompanyStatus, Plan } from "@/types";

interface Props {
  companies: Company[];
  plans?: Plan[]; // Optional to avoid breaking other usages immediately
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
  const getStatusColor = (status: CompanyStatus) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "INACTIVE":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
      case "OVERDUE":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "BANNED":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const statusTranslations: Record<CompanyStatus, string> = {
    ACTIVE: "Activo",
    INACTIVE: "Inactivo",
    OVERDUE: "Vencido",
    BANNED: "BLOQUEADO",
    TRIAL: "Prueba",
    CANCELED: "Cancelado",
  };

  return (
    <div className="bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-100 dark:bg-reply-surface-dark text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-reply-border-dark">
          <tr>
            <th className="px-6 py-3">Empresa / Slug</th>
            <th className="px-6 py-3">Plan Actual</th>
            <th className="px-6 py-3">Estado (Ciclo de Vida)</th>
            <th className="px-6 py-3">Fin Suscripción</th>
            <th className="px-6 py-3 text-right">Acciónes Rpidas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {companies.map((company) => (
            <tr
              key={company.id}
              className="hover:bg-reply-bg dark:hover:bg-[#2a3942] transition-colors"
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      company.logoUrl ||
                      `https://ui-avatars.com/api/?name=${company.name.replace(/\s+/g, "+")}`
                    }
                    alt="Logo"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white">
                      {company.name}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {`@${company.slug}`}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span
                  className={`px-2 py-1 rounded text-xs font-bold uppercase border border-opacity-20 ${
                    company.planId === "pro"
                      ? "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:text-purple-200"
                      : company.planId === "basic"
                        ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-200"
                        : "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {plans
                    ? plans.find((p) => p.id === company.planId)?.name ||
                      company.planId
                    : company.planId}
                </span>
              </td>
              <td className="px-6 py-4">
                <select
                  value={company.status}
                  onChange={(e) =>
                    onStatusChange(company.id, e.target.value as CompanyStatus)
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase border-none outline-none cursor-pointer appearance-none ${getStatusColor(company.status)}`}
                  aria-label={`Estado de ${company.name}`}
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                  <option value="OVERDUE">Vencido</option>
                  <option value="BANNED">BLOQUEADO</option>
                </select>
              </td>
              <td className="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono text-xs">
                {company.subscriptionEndsAt
                  ? new Date(company.subscriptionEndsAt).toLocaleDateString()
                  : "N/A"}
                {company.status === "OVERDUE" && (
                  <span className="ml-2 text-red-500 font-bold">(!)</span>
                )}
              </td>
              <td className="px-6 py-4 text-right flex justify-end gap-2">
                <button
                  onClick={() => onEdit(company)}
                  className="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                  title="Editar"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => onImpersonate(company.id)}
                  title="Iniciar sesión como Administrador de esta empresa"
                  className="text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => onViewMetrics(company.id)}
                  className="text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors"
                  title="Ver Métricas"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
