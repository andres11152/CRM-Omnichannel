import React from "react";
import type { SettingsTabProps } from "./SettingsShared";

interface GeneralTabProps extends SettingsTabProps {
  uploadingImage: boolean;
  onPickerOpen: () => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
  settings,
  updateSetting,
  uploadingImage,
  onPickerOpen,
}) => (
  <div className="space-y-6 animate-fadeIn">
    <div className="bg-white dark:bg-reply-panel-dark p-6 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
      <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
        Información General
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logo Section */}
        <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center p-6 bg-reply-bg dark:bg-black/20 rounded-2xl border border-dashed border-gray-200 dark:border-reply-border-dark/50 mb-4">
          <div className="relative group">
            <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-white dark:border-reply-border-dark shadow-xl relative">
              <img
                src={settings.general.logo || "https://ui-avatars.com/api/?name=Company&background=random"}
                className="w-full h-full object-cover"
                alt="Logo"
              />
              {uploadingImage && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <button
              onClick={onPickerOpen}
              className="absolute -bottom-3 -right-3 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg border-2 border-white dark:border-reply-border-dark hover:bg-indigo-700 transition-all active:scale-90"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <div className="mt-4 text-center">
            <h4 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wider">Logo de la Empresa</h4>
            <p className="text-[10px] text-gray-500 mt-1">Recomendado: 512x512px (PNG/JPG)</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">Nombre de la Empresa</span>
            <input
              type="text"
              value={settings.general.name}
              onChange={(e) => updateSetting("general", "name", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </label>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">Sitio Web</span>
            <input
              type="url"
              value={settings.general.website}
              onChange={(e) => updateSetting("general", "website", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
              placeholder="https://ejemplo.com"
            />
          </label>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">Teléfono Corporativo</span>
            <input
              type="tel"
              value={settings.general.phone}
              onChange={(e) => updateSetting("general", "phone", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </label>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">Zona Horaria</span>
            <select
              value={settings.general.timezone}
              onChange={(e) => updateSetting("general", "timezone", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none"
            >
              <option value="America/Bogota">Bogotá (GMT-5)</option>
              <option value="America/Mexico_City">CDMX (GMT-6)</option>
              <option value="America/New_York">New York (GMT-5)</option>
              <option value="UTC">UTC (GMT+0)</option>
            </select>
          </label>
        </div>
        <div className="col-span-1 md:col-span-2 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 block uppercase tracking-tight">Dirección Principal</span>
            <input
              type="text"
              value={settings.general.address}
              onChange={(e) => updateSetting("general", "address", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  </div>
);
