import React from "react";
import { useTranslation } from "react-i18next";
import { Plan } from "@/types";
import { FEATURE_META } from "./featureMeta";

const RESOURCE_LIMIT_KEYS = ["storage_limit_gb", "max_contacts", "max_companies", "max_workflows"];

interface GeneralConfigSectionProps {
  formData: Plan;
  currentFeatures: string[];
  onConfigChange: (key: string, value: string | number | boolean) => void;
  onRemoveFeature: (key: string) => void;
}

export const GeneralConfigSection: React.FC<GeneralConfigSectionProps> = ({
  formData,
  currentFeatures,
  onConfigChange,
  onRemoveFeature,
}) => {
  const { t } = useTranslation();

  return (
    <div className="mb-8">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 dark:border-reply-border-dark pb-2">
        {t("plans_mgmt.general_config", "Configuración General")}
      </h3>
      <div className="grid grid-cols-1 gap-4">
        {currentFeatures
          .filter((k) => !RESOURCE_LIMIT_KEYS.includes(k))
          .filter((k) => FEATURE_META[k]) // Only show modern features
          .map((key) => {
            const value = (formData.config as Record<string, unknown>)[key];
            const meta = FEATURE_META[key];
            const label = t(meta.labelKey);
            const description = t(meta.descKey);
            const icon = meta?.icon || <span className="text-2xl">️</span>;
            const type = meta?.type || (typeof value === "boolean" ? "boolean" : "number");

            return (
              <div
                key={key}
                className="group relative flex items-center gap-5 bg-reply-bg dark:bg-reply-surface-dark p-5 rounded-xl border border-gray-200 dark:border-reply-border-dark hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
              >
                <div className="p-3 bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-100 dark:border-reply-border-dark text-gray-600 dark:text-gray-300">
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base mb-0.5 flex items-center gap-2">{label}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{description}</p>
                </div>

                <div className="w-48">
                  {type === "boolean" ? (
                    <div className="relative">
                      <select
                        value={String(value)}
                        onChange={(e) => onConfigChange(key, e.target.value === "true")}
                        className={`w-full appearance-none border rounded-lg px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 transition-all cursor-pointer ${
                          value
                            ? "bg-green-50 text-green-700 border-green-200 focus:ring-green-500 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                            : "bg-red-50 text-red-700 border-red-200 focus:ring-red-500 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                        }`}
                      >
                        <option value="true">{t("plans_mgmt.enabled", "Habilitado")}</option>
                        <option value="false">{t("plans_mgmt.disabled", "Deshabilitado")}</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-current">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={String(value)}
                      onChange={(e) => onConfigChange(key, Number(e.target.value))}
                      className="w-full bg-white dark:bg-reply-panel-dark border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-sm font-bold text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    />
                  )}
                </div>

                <button
                  onClick={() => onRemoveFeature(key)}
                  className="absolute -top-2 -right-2 bg-white dark:bg-reply-border-dark text-gray-400 hover:text-red-500 p-1 rounded-full shadow-md border border-gray-200 dark:border-gray-600 opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110"
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
