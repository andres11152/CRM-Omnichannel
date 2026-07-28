import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModuleHeader } from "./common/ModuleHeader";
import { WhatsAppTab } from "./integrations/WhatsAppTab";
import { InstagramTab } from "./integrations/InstagramTab";
import { DiscoverTab } from "./integrations/DiscoverTab";

export const IntegrationsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"whatsapp" | "instagram" | "discover">("whatsapp");

  return (
    <div className="flex-1 bg-gray-50 dark:bg-reply-bg-dark min-h-screen flex flex-col">
      <ModuleHeader
        title={t("integrations_panel.title", "Integraciones & Canales")}
        description={t("integrations_panel.subtitle", "Conecta y configura tus canales de comunicación omnichannel")}
        icon={
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 10.742L12 12.75l3.316-2.008M12 12.75V21m-3.316-10.258A2 2 0 004 12v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-4.684-1.258" />
          </svg>
        }
        gradient="from-indigo-600 to-indigo-800"
      />

      <div className="max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Tab Selector Header */}
        <div className="flex p-1 bg-gray-100 dark:bg-gray-800/60 rounded-xl max-w-md border border-gray-200/20">
          <button
            onClick={() => setActiveTab("whatsapp")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "whatsapp"
                ? "bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t("integrations_panel.tabs.whatsapp", "WhatsApp")}
          </button>
          <button
            onClick={() => setActiveTab("instagram")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "instagram"
                ? "bg-white dark:bg-gray-700 text-pink-600 dark:text-pink-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t("integrations_panel.tabs.instagram", "Instagram")}
          </button>
          <button
            onClick={() => setActiveTab("discover")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "discover"
                ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t("integrations_panel.tabs.discover", "Explorar")}
          </button>
        </div>

        {/* Modular Tab Content */}
        <div className="space-y-6">
          {activeTab === "whatsapp" && <WhatsAppTab />}
          {activeTab === "instagram" && <InstagramTab />}
          {activeTab === "discover" && <DiscoverTab />}
        </div>
      </div>
    </div>
  );
};
