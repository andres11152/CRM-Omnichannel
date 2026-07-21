import React from "react";
import { useTranslation } from "react-i18next";
import { ModuleHeader } from "../common/ModuleHeader";
import { usePlanManagement } from "./usePlanManagement";
import { FEATURE_META } from "./featureMeta";
import { PlanListSidebar } from "./PlanListSidebar";
import { AddFeatureMenu } from "./AddFeatureMenu";
import { GeneralConfigSection } from "./GeneralConfigSection";
import { ResourceLimitsSection } from "./ResourceLimitsSection";

interface Props {
  onNavigateToDashboard: () => void;
}

export const PlanManagement: React.FC<Props> = ({ onNavigateToDashboard }) => {
  const { t } = useTranslation();
  const pm = usePlanManagement();

  // Determine which features are not yet added to the current plan
  const currentFeatures = pm.formData ? Object.keys(pm.formData.config) : [];
  const availableFeaturesToAdd = Object.keys(FEATURE_META).filter((f) => !currentFeatures.includes(f));

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      <ModuleHeader
        title={t("plans_mgmt.title", "Gestión de Planes")}
        description={t("plans_mgmt.description", "Define límites y características de cada plan de suscripción.")}
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        }
        gradient="from-slate-800 via-slate-900 to-emerald-900 dark:from-black dark:via-slate-900 dark:to-emerald-950"
        action={
          <button
            onClick={onNavigateToDashboard}
            className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl text-sm font-bold backdrop-blur-md border border-white/20 transition-all active:scale-95 flex items-center gap-2 shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t("plans_mgmt.back", "Volver al Panel")}
          </button>
        }
      />

      <div className="flex-1 p-6 md:p-8 overflow-hidden bg-slate-50/30 dark:bg-transparent">
        {pm.isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : (
          <div className="h-full flex gap-6">
            <PlanListSidebar
              plans={pm.plans}
              selectedPlanId={pm.selectedPlanId}
              onSelectPlan={pm.setSelectedPlanId}
              onCreatePlan={pm.handleCreatePlan}
            />

            {/* MAIN CONTENT: PLAN EDITOR */}
            <div className="flex-1 flex flex-col bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-lg overflow-hidden">
              {pm.formData ? (
                <>
                  <div className="flex-1 overflow-y-auto p-8">
                    {/* HEADER INFO */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
                      <div className="md:col-span-5">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                          {t("plans_mgmt.plan_name", "Nombre del Plan")}
                        </label>
                        <input
                          type="text"
                          value={pm.formData.name}
                          onChange={(e) => pm.handleInputChange("name", e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark text-gray-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                          placeholder="Ej: Pro Plan"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                          {t("plans_mgmt.price", "Precio (USD)")}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-3 text-gray-500 dark:text-gray-400">$</span>
                          <input
                            type="number"
                            value={pm.formData.price}
                            onChange={(e) => pm.handlePriceChange(e.target.value)}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-8 pr-4 py-3 bg-reply-bg dark:bg-reply-surface-dark text-gray-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                          {t("plans_mgmt.stripe_price_id", "Stripe Price ID")}
                        </label>
                        <input
                          type="text"
                          value={pm.formData.stripePriceId || ""}
                          onChange={(e) => pm.handleInputChange("stripePriceId", e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 bg-reply-bg dark:bg-reply-surface-dark text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                          placeholder="price_..."
                        />
                      </div>
                    </div>

                    {/* FEATURES SECTION */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2">
                          {t("plans_mgmt.limits_features", "Límites y Features")}
                          <span className="text-xs font-normal text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                            {currentFeatures.length}
                          </span>
                        </h3>

                        <AddFeatureMenu availableFeatures={availableFeaturesToAdd} onAddFeature={pm.addFeature} />
                      </div>

                      <GeneralConfigSection
                        formData={pm.formData}
                        currentFeatures={currentFeatures}
                        onConfigChange={pm.handleConfigChange}
                        onRemoveFeature={pm.removeFeature}
                      />

                      <ResourceLimitsSection formData={pm.formData} onConfigChange={pm.handleConfigChange} onRemoveFeature={pm.removeFeature} />
                    </div>
                  </div>

                  {/* FOOTER ACTIONS */}
                  <div className="p-6 border-t border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark flex justify-between items-center">
                    <button
                      onClick={pm.handleDeletePlan}
                      disabled={pm.isDeleting}
                      className="bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40 px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {pm.isDeleting ? t("plans_mgmt.deleting", "Eliminando...") : t("plans_mgmt.delete_plan", "Eliminar Plan")}
                    </button>

                    <button
                      onClick={pm.handleSave}
                      disabled={pm.isSaving}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all transform active:scale-95 flex items-center gap-2 disabled:opacity-50"
                    >
                      {pm.isSaving ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          {t("plans_mgmt.saving", "Guardando...")}
                        </>
                      ) : (
                        t("plans_mgmt.save_changes", "Guardar Cambios")
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                  <div className="w-24 h-24 bg-gray-100 dark:bg-reply-surface-dark rounded-full flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-600 dark:text-gray-300 mb-2">
                    {t("plans_mgmt.no_selection_title", "Ningún plan seleccionado")}
                  </h3>
                  <p className="max-w-xs mx-auto">
                    {t("plans_mgmt.no_selection_desc", "Selecciona un plan de la lista o crea uno nuevo para comenzar a editar.")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
