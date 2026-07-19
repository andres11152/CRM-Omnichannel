import React from "react";
import { useTranslation } from "react-i18next";

const IntegrationCard = ({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark p-6 flex items-start gap-4 opacity-75 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer hover:shadow-md">
      <div className="w-12 h-12 rounded-xl bg-reply-bg dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-gray-800 dark:text-white text-base">
          {title}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
          {desc}
        </p>
        <button className="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
          {t("common.connect", "Conectar")}
        </button>
      </div>
    </div>
  );
};

export const DiscoverTab: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className="bg-reply-bg/60 dark:bg-reply-surface-dark/40 rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark p-6 md:p-8">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
          </svg>
        </div>
        <div className="min-w-0 flex items-center gap-2.5">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">
            {t("integrations.discover.title", "Descubrir Más Canales")}
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[11px] font-bold border border-indigo-200 dark:border-indigo-800">
            {t("common.coming_soon", "Próximamente")}
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 mb-6">
        {t("integrations.discover.desc", "Nuevas integraciones en camino para centralizar aún más canales.")}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <IntegrationCard
          title={t("integrations.discover.messenger_title", "Facebook Messenger")}
          desc={t("integrations.discover.messenger_desc", "Sincroniza tu fanpage y automatiza respuestas.")}
          icon={
            <svg
              className="w-8 h-8 text-[#1877F2] fill-current"
              viewBox="0 0 24 24"
            >
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          }
        />
        <IntegrationCard
          title={t("integrations.discover.shopify_title", "Shopify / WooCommerce")}
          desc={t("integrations.discover.shopify_desc", "Integra tu catálogo y pedidos.")}
          icon={<span className="text-2xl">🛍️</span>}
        />
      </div>
    </section>
  );
};
