import React from "react";
import type { CompanySettingsState, DayKey } from "@/hooks/useCompanySettings";

// ────────────────────────────────────────────────
// SHARED NAV BUTTON
// ────────────────────────────────────────────────

export const NavButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  fullLabel?: string;
}> = ({ active, onClick, icon, label, fullLabel }) => (
  <button
    onClick={onClick}
    className={`flex-none md:w-full flex items-center justify-center md:justify-start gap-3 px-5 md:px-6 py-4 transition-all border-b-2 md:border-b-0 md:border-l-4 whitespace-nowrap ${
      active
        ? "bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 border-indigo-600 font-bold"
        : "text-gray-500 dark:text-gray-400 hover:bg-reply-bg dark:hover:bg-gray-800 border-transparent hover:text-gray-700 dark:hover:text-gray-200"
    }`}
  >
    <svg
      className={`w-5 h-5 shrink-0 ${active ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {icon}
    </svg>
    <span className="text-sm md:hidden">{label}</span>
    <span className="text-sm hidden md:block">{fullLabel || label}</span>
  </button>
);

// ────────────────────────────────────────────────
// DAY NAMES MAP (Shared by BusinessHours)
// ────────────────────────────────────────────────

export const DAY_NAMES: Record<DayKey, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ────────────────────────────────────────────────
// SHARED PROP INTERFACES
// ────────────────────────────────────────────────

export interface SettingsTabProps {
  settings: CompanySettingsState;
  updateSetting: (
    section: keyof CompanySettingsState,
    key: string,
    value: string | boolean | number,
  ) => void;
  loading: boolean;
}
