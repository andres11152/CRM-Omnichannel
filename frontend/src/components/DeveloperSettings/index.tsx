import React from "react";
import { useTranslation } from "react-i18next";
import { ModuleHeader } from "../common/ModuleHeader";
import { Activity, ShieldCheck, Code } from "lucide-react";
import { useDeveloperSettings } from "./useDeveloperSettings";
import { WebhooksTab } from "./WebhooksTab";
import { ApiKeysTab } from "./ApiKeysTab";
import { ApiDocsTab } from "./ApiDocsTab";

export const DeveloperSettings: React.FC = () => {
  const { t } = useTranslation();
  const ds = useDeveloperSettings();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-200 dark:border-reply-border-dark transition-colors duration-200">
      <ModuleHeader
        title={t("developer_settings.title", "Developer API & Webhooks")}
        description={t("developer_settings.subtitle", "Webhooks para eventos en tiempo real y API Keys para acceso programático externo.")}
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        }
        gradient="from-gray-600 to-zinc-600 dark:from-gray-800 dark:to-zinc-800"
        stats={{
          label: ds.activeTab === "webhooks" ? t("developer_settings.stats.active_webhooks", "Webhooks Activos") : t("developer_settings.stats.active_keys", "Keys Activas"),
          value: ds.activeTab === "webhooks" ? ds.webhooks.filter((w) => w.isActive).length : ds.apiKeys.length,
        }}
        action={
          <div className="flex bg-black/20 rounded-xl p-1 backdrop-blur-sm border border-white/10 shrink-0">
            {(
              [
                { key: "webhooks", icon: Activity, label: t("developer_settings.tabs.webhooks", "Webhooks") },
                { key: "api-keys", icon: ShieldCheck, label: t("developer_settings.tabs.api_keys", "API Keys") },
                { key: "api-docs", icon: Code, label: t("developer_settings.tabs.api_docs", "API Docs") },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => ds.setActiveTab(key)}
                className={`px-3 md:px-5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 ${
                  ds.activeTab === key ? "bg-white text-gray-900 shadow-lg" : "text-white/70 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto bg-reply-bg dark:bg-reply-bg-dark p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
          {ds.activeTab === "webhooks" && <WebhooksTab ds={ds} />}
          {ds.activeTab === "api-keys" && <ApiKeysTab ds={ds} />}
          {ds.activeTab === "api-docs" && <ApiDocsTab />}
        </div>
      </div>
    </div>
  );
};
