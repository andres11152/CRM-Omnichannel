import React from "react";
import { useTenantManagement } from "@/hooks/useTenantManagement";
import { AdminTenantTable } from "./tenants/AdminTenantTable";
import { ModuleHeader } from "./common/ModuleHeader";
import { CreateTenantModal } from "./tenants/CreateTenantModal";
import { EditTenantModal } from "./tenants/EditTenantModal";
import { TenantMetricsModal } from "./tenants/TenantMetricsModal";

interface Props {
  onNavigate: (tab: string) => void;
}

export const TenantManagement: React.FC<Props> = ({ onNavigate }) => {
  const {
    filteredCompanies,
    loading,
    searchTerm,
    setSearchTerm,
    availablePlans,
    isModalOpen,
    setIsModalOpen,
    isMetricsModalOpen,
    setIsMetricsModalOpen,
    editingCompany,
    setEditingCompany,
    selectedCompanyMetrics,
    metrics,
    loadingMetrics,
    handleStatusChange,
    handleUpdateCompany,
    handleImpersonate,
    handleViewMetrics,
    refresh,
  } = useTenantManagement();

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-y-auto">
      <ModuleHeader
        title="Gestión de Empresas (Tenants)"
        description="Supervisa y administra todas las cuentas de clientes en la plataforma."
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
        gradient="from-indigo-600 to-blue-600 dark:from-indigo-800 dark:to-blue-800"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/20 transition-all flex items-center gap-2"
          >
            + Nueva Empresa
          </button>
        }
      />

      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
          <input
            type="text"
            placeholder="Buscar por nombre o slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white w-1/3"
          />
          <button
            onClick={() => onNavigate("plans")}
            className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1"
          >
            Configurar Planes
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 animate-pulse">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            Cargando Inquilinos...
          </div>
        ) : (
          <AdminTenantTable
            companies={filteredCompanies}
            plans={availablePlans}
            onStatusChange={handleStatusChange}
            onImpersonate={handleImpersonate}
            onViewMetrics={handleViewMetrics}
            onEdit={(company) => setEditingCompany(company)}
          />
        )}
      </div>

      {/* Modals Bundle */}
      <CreateTenantModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={refresh}
        availablePlans={availablePlans}
      />

      {editingCompany && (
        <EditTenantModal
          company={editingCompany}
          plans={availablePlans}
          onClose={() => setEditingCompany(null)}
          onUpdate={handleUpdateCompany}
        />
      )}

      <TenantMetricsModal
        isOpen={isMetricsModalOpen}
        onClose={() => setIsMetricsModalOpen(false)}
        company={selectedCompanyMetrics}
        metrics={metrics}
        loading={loadingMetrics}
      />
    </div>
  );
};
