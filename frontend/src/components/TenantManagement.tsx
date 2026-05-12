import React from "react";
import { useTranslation } from "react-i18next";
import { useTenantManagement } from "@/hooks/useTenantManagement";
import { AdminTenantTable } from "./tenants/AdminTenantTable";
import { ModuleHeader } from "./common/ModuleHeader";
import { CreateTenantModal } from "./tenants/CreateTenantModal";
import { EditTenantModal } from "./tenants/EditTenantModal";
import { TenantMetricsModal } from "./tenants/TenantMetricsModal";
import { ImpersonationModal } from "./tenants/ImpersonationModal";
import { Building2, Plus, Settings } from "lucide-react";

interface Props {
  onNavigate: (tab: string) => void;
}

export const TenantManagement: React.FC<Props> = ({ onNavigate }) => {
  const { t } = useTranslation();
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
    isImpersonateModalOpen,
    setIsImpersonateModalOpen,
    companyToImpersonate,
    companyUsers,
    loadingUsers,
    confirmImpersonate,
    refresh,
  } = useTenantManagement();

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      <ModuleHeader
        title={t("tenants.title", "Gestión de Empresas (Tenants)")}
        description={t("tenants.description", "Supervisa y administra todas las cuentas de clientes en la plataforma.")}
        icon={<Building2 className="w-8 h-8 text-white" />}
        gradient="from-slate-800 via-slate-900 to-indigo-900 dark:from-black dark:via-slate-900 dark:to-indigo-950"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl text-sm font-bold backdrop-blur-md border border-white/20 transition-all active:scale-95 flex items-center gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            {t("tenants.new_tenant", "Nueva Empresa")}
          </button>
        }
      />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-transparent space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-reply-panel-dark p-5 rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm">
          <div className="relative w-full md:w-1/3">
             <input
              type="text"
              placeholder={t("tenants.search", "Buscar empresas...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-reply-surface-dark rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white transition-all outline-none"
            />
          </div>
          <button
            onClick={() => onNavigate("plans")}
            className="w-full md:w-auto bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-white/5"
          >
            <Settings className="w-4 h-4" />
            {t("tenants.configure_plans", "Configurar Planes de Suscripción")}
          </button>
        </div>

        {loading ? (
          <div className="p-20 text-center text-slate-500 animate-pulse flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-bold tracking-tight">{t("tenants.syncing", "Sincronizando Tenants...")}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm overflow-hidden">
            <AdminTenantTable
              companies={filteredCompanies}
              plans={availablePlans}
              onStatusChange={handleStatusChange}
              onImpersonate={handleImpersonate}
              onViewMetrics={handleViewMetrics}
              onEdit={(company) => setEditingCompany(company)}
            />
          </div>
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

      <ImpersonationModal
        isOpen={isImpersonateModalOpen}
        onClose={() => setIsImpersonateModalOpen(false)}
        companyName={companyToImpersonate?.name || ""}
        users={companyUsers}
        loadingUsers={loadingUsers}
        onConfirm={confirmImpersonate}
      />
    </div>
  );
};
