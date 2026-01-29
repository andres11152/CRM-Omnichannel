import React from 'react';

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
    <div className={`px-8 py-6 bg-gradient-to-r ${gradient}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              {icon}
            </div>
            {title}
          </h2>
          <p className="text-white/80 mt-1 text-sm font-medium ml-14">
            {description}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {stats && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20 min-w-[120px]">
              <div className="text-xs text-white/80 uppercase tracking-wider font-semibold">{stats.label}</div>
              <div className="text-2xl font-bold text-white">{stats.value}</div>
            </div>
          )}
          
          {action && (
            <div className="flex-shrink-0">
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
