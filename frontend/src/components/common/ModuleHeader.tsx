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
      className={`px-4 md:px-8 pt-8 md:pt-12 pb-6 md:pb-8 bg-gradient-to-r ${gradient} relative overflow-hidden`}
    >
      {/* Decorative background element */}
      <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 md:p-2.5 bg-white/20 rounded-xl backdrop-blur-md border border-white/20 shadow-lg flex-shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-bold text-white tracking-tight">
              {title}
            </h2>
            <p className="text-white/80 mt-0.5 text-xs md:text-sm font-medium">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4 mt-2 md:mt-0">
          {stats && (
            <div className="bg-black/10 backdrop-blur-md rounded-xl px-4 py-1.5 md:py-2 border border-white/10 flex flex-col md:min-w-[120px]">
              <div className="text-[10px] md:text-xs text-white/70 uppercase tracking-widest font-bold">
                {stats.label}
              </div>
              <div className="text-lg md:text-2xl font-black text-white leading-none mt-0.5">
                {stats.value}
              </div>
            </div>
          )}

          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      </div>
    </div>
  );
};
