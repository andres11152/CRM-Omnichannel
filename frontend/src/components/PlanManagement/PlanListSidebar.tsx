import React from "react";
import { useTranslation } from "react-i18next";
import { Plan } from "@/types";

interface PlanListSidebarProps {
  plans: Plan[];
  selectedPlanId: string | null;
  onSelectPlan: (id: string) => void;
  onCreatePlan: () => void;
}

export const PlanListSidebar: React.FC<PlanListSidebarProps> = ({ plans, selectedPlanId, onSelectPlan, onCreatePlan }) => {
  const { t } = useTranslation();

  return (
    <div className="w-80 flex flex-col bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark">
        <h3 className="font-bold text-gray-700 dark:text-gray-200">{t("plans_mgmt.available_plans", "Planes Disponibles")}</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {plans.map((p) => (
          <div
            key={p.id}
            onClick={() => onSelectPlan(p.id)}
            className={`p-4 rounded-xl cursor-pointer transition-all border relative group ${
              selectedPlanId === p.id
                ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 dark:border-indigo-400 ring-1 ring-indigo-500 dark:ring-indigo-400"
                : "bg-white dark:bg-reply-border-dark border-gray-200 dark:border-reply-border-dark hover:border-indigo-300 dark:hover:border-indigo-500"
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span
                className={`font-bold text-lg ${selectedPlanId === p.id ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-white"}`}
              >
                {p.name}
              </span>
              {selectedPlanId === p.id && <span className="text-indigo-600 dark:text-indigo-400">●</span>}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              ${p.price} <span className="text-xs opacity-70">/mes</span>
            </div>
          </div>
        ))}

        {plans.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm italic">{t("plans_mgmt.no_plans", "No hay planes creados.")}</div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark">
        <button
          onClick={onCreatePlan}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg text-sm shadow-md transition-all transform active:scale-95 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {t("plans_mgmt.create_plan", "Crear Nuevo Plan")}
        </button>
      </div>
    </div>
  );
};
