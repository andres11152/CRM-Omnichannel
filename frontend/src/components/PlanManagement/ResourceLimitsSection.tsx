import React from "react";
import { useTranslation } from "react-i18next";
import { Plan } from "@/types";
import { FEATURE_META } from "./featureMeta";

const RESOURCE_LIMIT_KEYS = ["storage_limit_gb", "max_contacts", "max_companies", "max_workflows"];

interface ResourceLimitsSectionProps {
  formData: Plan;
  onConfigChange: (key: string, value: string | number | boolean) => void;
  onRemoveFeature: (key: string) => void;
}

export const ResourceLimitsSection: React.FC<ResourceLimitsSectionProps> = ({ formData, onConfigChange, onRemoveFeature }) => {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 dark:border-reply-border-dark pb-2">
        {t("plans_mgmt.resource_limits", "Límites de Recursos (Quotas)")}
      </h3>
      <div className="grid grid-cols-1 gap-4">
        {RESOURCE_LIMIT_KEYS.map((key) => {
          if (!Object.prototype.hasOwnProperty.call(formData.config as Record<string, unknown>, key)) return null;

          const value = (formData.config as Record<string, unknown>)[key];
          const meta = FEATURE_META[key];
          const isUnlimited = value === -1 || value === null;

          return (
            <div
              key={key}
              className="group relative flex items-center gap-5 bg-reply-bg dark:bg-reply-surface-dark p-5 rounded-xl border border-gray-200 dark:border-reply-border-dark hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            >
              <div className="p-3 bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-100 dark:border-reply-border-dark text-gray-600 dark:text-gray-300">
                {meta?.icon}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base mb-0.5 leading-tight">{t(meta?.labelKey)}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t(meta?.descKey)}</p>
                {key === "storage_limit_gb" && (
                  <p className="text-[10px] text-indigo-500 font-medium mt-1">1 GB ≈ 500 imágenes de alta calidad</p>
                )}
              </div>

              <div className="w-56 flex flex-col items-end gap-2">
                {/* Unlimited Toggle */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isUnlimited ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                    {isUnlimited ? t("plans_mgmt.unlimited", "Ilimitado") : t("plans_mgmt.limited", "Limitado")}
                  </span>
                  <button
                    type="button"
                    onClick={() => onConfigChange(key, isUnlimited ? 0 : -1)} // Toggle: If unlim (-1) -> 0 (limit mode). If limit -> -1
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${isUnlimited ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                  >
                    <div
                      className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${isUnlimited ? "translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                </div>

                <input
                  type="number"
                  disabled={isUnlimited}
                  value={isUnlimited ? "" : String(value)}
                  placeholder={isUnlimited ? "∞" : "0"}
                  onChange={(e) => onConfigChange(key, Number(e.target.value))}
                  className={`w-full bg-white dark:bg-reply-panel-dark border rounded-lg px-4 py-2 text-sm font-bold transition-all
                                  ${
                                    isUnlimited
                                      ? "border-gray-200 dark:border-reply-border-dark text-gray-400 italic cursor-not-allowed bg-reply-bg dark:bg-reply-surface-dark"
                                      : "border-indigo-300 dark:border-indigo-600 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                  }`}
                />
              </div>

              <button
                onClick={() => onRemoveFeature(key)}
                className="absolute -top-2 -right-2 bg-white dark:bg-reply-border-dark text-gray-400 hover:text-red-500 p-1 rounded-full shadow-md border border-gray-200 dark:gray-600 opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110 z-10"
                title="Eliminar característica"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
