import React from "react";
import { useTranslation } from "react-i18next";
import { FEATURE_META } from "./featureMeta";

interface AddFeatureMenuProps {
  availableFeatures: string[];
  onAddFeature: (key: string) => void;
}

export const AddFeatureMenu: React.FC<AddFeatureMenuProps> = ({ availableFeatures, onAddFeature }) => {
  const { t } = useTranslation();

  if (availableFeatures.length === 0) return null;

  return (
    <div className="relative group z-10">
      <button className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-2 border border-indigo-200 dark:border-indigo-800">
        <span>{t("plans_mgmt.add_feature", "+ Añadir Característica")}</span>
      </button>
      <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-reply-surface-dark rounded-xl shadow-2xl border border-gray-200 dark:border-reply-border-dark p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-right">
        <div className="text-xs font-bold text-gray-400 uppercase px-2 py-1 mb-1">{t("plans_mgmt.available", "Disponibles")}</div>
        {availableFeatures.map((key) => (
          <button
            key={key}
            onClick={() => onAddFeature(key)}
            className="w-full flex items-center gap-3 p-3 hover:bg-reply-bg dark:hover:bg-reply-border-dark rounded-lg text-left transition-colors"
          >
            <div className="text-gray-500 dark:text-gray-400">{FEATURE_META[key]?.icon}</div>
            <div>
              <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{t(FEATURE_META[key]?.labelKey)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">{t(FEATURE_META[key]?.descKey)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
