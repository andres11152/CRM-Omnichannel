import React from "react";

interface ModuleHeaderProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  stats?: {
    label: string;
    value: string | number;
  };
  action?: React.ReactNode;
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({
  title,
  description,
  icon,
  gradient,
  stats,
  action,
}) => {
  return (
    <div
      className={`px-3 py-2 md:px-8 md:pt-4 md:pb-3 bg-gradient-to-r ${gradient} relative overflow-hidden`}
    >
      {/* Decorative background element */}
      <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between gap-3 relative z-10 w-full">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <div className="p-1.5 md:p-2.5 bg-white/20 rounded-lg md:rounded-xl backdrop-blur-md border border-white/20 shadow-lg flex-shrink-0">
            <div className="w-4 h-4 md:w-6 md:h-6 [&>svg]:w-full [&>svg]:h-full [&>svg]:text-white flex items-center justify-center">
              {icon}
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-base md:text-3xl font-extrabold text-white tracking-tight truncate">
              {title}
            </h2>
            <p className="hidden md:block text-white/80 mt-0.5 text-xs md:text-sm font-medium">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          {stats && (
            <div className="hidden md:flex bg-black/10 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10 flex-col md:min-w-[120px]">
              <div className="text-xs text-white/70 uppercase tracking-widest font-bold whitespace-nowrap">
                {stats.label}
              </div>
              <div className="text-2xl font-black text-white leading-none mt-1">
                {stats.value}
              </div>
            </div>
          )}

          {action && (
            <div className="flex-shrink-0 [&>button]:py-1 [&>button]:px-2.5 md:[&>button]:py-2 md:[&>button]:px-4 [&>button]:text-xs md:[&>button]:text-sm [&>button]:rounded-md md:[&>button]:rounded-lg">
              {action}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Stats Sub-bar */}
      {stats && (
        <div className="md:hidden relative z-10 mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="uppercase tracking-wider font-semibold text-[9px] text-white/60">
              {stats.label}
            </span>
          </div>
          <span className="font-mono font-bold text-[10px] text-white bg-black/25 px-2 py-0.5 rounded border border-white/5">
            {stats.value}
          </span>
        </div>
      )}
    </div>
  );
};
