import React from "react";
import type { SettingsTabProps } from "./SettingsShared";
import { DAY_NAMES, DAY_KEYS } from "./SettingsShared";
import type { DayKey } from "@/hooks/useCompanySettings";

interface BusinessHoursTabProps extends SettingsTabProps {
  updateBusinessHour: (day: string, field: string, value: string | boolean) => void;
}

export const BusinessHoursTab: React.FC<BusinessHoursTabProps> = ({
  settings,
  updateSetting,
  updateBusinessHour,
}) => (
  <div className="space-y-6 animate-fadeIn">
    <div className="bg-white dark:bg-reply-panel-dark p-5 md:p-8 rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm relative overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-white">Horario de Atención</h3>
          <p className="text-sm text-gray-500 mt-1">Define cuándo tu equipo está disponible para responder.</p>
        </div>
        <label className="inline-flex items-center cursor-pointer group">
          <span className="mr-3 text-sm font-bold text-gray-700 dark:text-gray-400 group-hover:text-indigo-600 transition-colors">
            Estado del Horario
          </span>
          <div className="relative">
            <input
              type="checkbox"
              checked={settings.businessHours.enabled}
              onChange={(e) => updateSetting("businessHours", "enabled", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
          </div>
        </label>
      </div>

      <div className="space-y-3 bg-reply-bg dark:bg-black/20 p-4 md:p-6 rounded-2xl">
        {DAY_KEYS.map((day) => {
          const dayConfig = settings.businessHours.schedule[day];
          return (
            <div
              key={day}
              className={`flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl transition-all ${dayConfig.active ? "bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-reply-border-dark" : "opacity-60 underline-offset-4"}`}
            >
              <div className="flex items-center gap-3 min-w-[120px]">
                <input
                  type="checkbox"
                  checked={dayConfig.active}
                  onChange={(e) => updateBusinessHour(day, "active", e.target.checked)}
                  className="w-5 h-5 rounded-lg border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className={`text-sm font-bold ${dayConfig.active ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>
                  {DAY_NAMES[day]}
                </span>
              </div>

              {dayConfig.active ? (
                <div className="flex items-center gap-2 bg-reply-bg dark:bg-gray-900 p-1.5 rounded-lg border border-gray-100 dark:border-reply-border-dark">
                  <input
                    type="time"
                    value={dayConfig.open}
                    onChange={(e) => updateBusinessHour(day, "open", e.target.value)}
                    className="bg-transparent text-sm font-bold text-indigo-600 focus:outline-none px-1"
                  />
                  <span className="text-gray-400 px-1">a</span>
                  <input
                    type="time"
                    value={dayConfig.close}
                    onChange={(e) => updateBusinessHour(day, "close", e.target.value)}
                    className="bg-transparent text-sm font-bold text-indigo-600 focus:outline-none px-1"
                  />
                </div>
              ) : (
                <span className="text-xs font-medium text-gray-400 uppercase tracking-widest bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                  No Laboral
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  </div>
);
