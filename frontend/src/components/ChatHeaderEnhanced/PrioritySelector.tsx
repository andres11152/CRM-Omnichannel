import React, { useState } from "react";

interface PrioritySelectorProps {
  currentPriority: "LOW" | "MEDIUM" | "HIGH";
  onChangePriority?: (priority: "LOW" | "MEDIUM" | "HIGH") => void;
}

export const PrioritySelector: React.FC<PrioritySelectorProps> = ({ currentPriority, onChangePriority }) => {
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={() => setShowPriorityMenu(!showPriorityMenu)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all h-9 shrink-0 select-none ${
          currentPriority === "HIGH"
            ? "bg-red-50/50 text-red-700 border-red-200 hover:bg-red-50 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50"
            : currentPriority === "MEDIUM"
              ? "bg-orange-50/50 text-orange-700 border-orange-200 hover:bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/50"
              : "bg-blue-50/50 text-blue-700 border-blue-200 hover:bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50"
        }`}
      >
        {/* ICON: HIGH */}
        {currentPriority === "HIGH" && (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
        {/* ICON: MEDIUM */}
        {currentPriority === "MEDIUM" && (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
          </svg>
        )}
        {/* ICON: LOW */}
        {currentPriority === "LOW" && (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        )}

        <span className="uppercase tracking-wide">{currentPriority}</span>

        <svg
          className={`w-3 h-3 ml-0.5 opacity-60 transition-transform duration-200 ${showPriorityMenu ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* DROPDOWN MENU */}
      {showPriorityMenu && (
        <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden z-[9999] ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-1">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
              <button
                key={priority}
                onClick={() => {
                  onChangePriority?.(priority);
                  setShowPriorityMenu(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-[11px] font-bold rounded-lg flex items-center gap-3 transition-colors ${
                  priority === "HIGH"
                    ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    : priority === "MEDIUM"
                      ? "text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      : "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                }`}
              >
                {/* ICON REPEAT FOR MENU */}
                {priority === "HIGH" && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                {priority === "MEDIUM" && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                  </svg>
                )}
                {priority === "LOW" && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                )}
                {priority}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
