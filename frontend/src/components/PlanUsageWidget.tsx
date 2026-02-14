import React from 'react';

interface UsageItem {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

interface Props {
  planName: string;
  usage: UsageItem[];
}

export const PlanUsageWidget: React.FC<Props> = ({ planName, usage }) => {
  const getProgressColor = (percent: number) => {
    if (percent > 90) return 'bg-red-500';
    if (percent > 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const isCritical = usage.some(item => {
      if (item.limit === -1) return false;
      const percent = (item.used / item.limit) * 100;
      return percent > 90;
  });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-reply-panel-dark rounded-2xl shadow-sm border border-gray-100 dark:border-reply-border-dark overflow-hidden relative">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-reply-border-dark bg-reply-bg/50 dark:bg-reply-surface-dark/50 flex justify-between items-center">
         <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Tu Plan</h3>
            <div className="flex items-center gap-2">
                <span className="text-xl font-black text-gray-800 dark:text-white">{planName}</span>
                {planName !== 'Sin Plan' && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded-full border border-green-200">Activo</span>
                )}
            </div>
         </div>
         {isCritical && (
             <button className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-md hover:shadow-lg transition-all animate-pulse">
                 Mejorar Plan
             </button>
         )}
      </div>

      {/* Usage Stats */}
      <div className="p-5 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
        {usage.map((item, i) => {
            const isUnlimited = item.limit === -1;
            const percentage = isUnlimited ? 0 : Math.min((item.used / item.limit) * 100, 100);
            const colorClass = getProgressColor(percentage);

            return (
                <div key={i} className="group">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{item.label}</span>
                        <div className="text-right">
                             {isUnlimited ? (
                                 <span className="flex items-center gap-1 text-green-500 font-bold bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-md text-xs">
                                     <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.21 1.74-6.3L2 12l4.5 5.5z"/></svg>
                                     Ilimitado
                                 </span>
                             ) : (
                                 <span className={`text-xs font-mono font-bold ${percentage > 90 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                     {item.used} / {item.limit} <span className="text-[10px] uppercase text-gray-400">{item.unit}</span>
                                 </span>
                             )}
                        </div>
                    </div>

                    {isUnlimited ? (
                         <div className="w-full h-2 bg-green-100 dark:bg-green-900/20 rounded-full overflow-hidden relative">
                             <div className="absolute inset-0 bg-striped-green opacity-30"></div>
                         </div>
                    ) : (
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden shadow-inner">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ease-out ${colorClass} relative`}
                                style={{ width: `${percentage}%` }}
                            >
                                {percentage > 90 && <div className="absolute inset-0 bg-white/30 animate-pulse" />}
                            </div>
                        </div>
                    )}
                    
                    {/* Tooltip for Critical */}
                    {!isUnlimited && percentage > 90 && (
                        <p className="text-[10px] text-red-500 mt-1 font-medium animate-bounce">
                           ⚠️ Límite crítico alcanzado
                        </p>
                    )}
                </div>
            );
        })}

        {usage.length === 0 && (
             <div className="text-center py-10 opacity-50">
                 <p className="text-gray-400 italic text-sm">No hay métricas de uso disponibles.</p>
             </div>
        )}
      </div>
      
      {/* Footer Up-sell */}
      <div className="p-4 bg-gradient-to-r from-gray-50 to-white dark:from-[#1a262d] dark:to-[#202c33] border-t border-gray-100 dark:border-reply-border-dark text-center">
            <span className="text-xs text-gray-500 dark:text-gray-400">¿Necesitas más recursos? </span>
            <a href="#" className="text-xs font-bold text-indigo-500 hover:text-indigo-400 hover:underline">Ver Planes</a>
      </div>

       <style>{`
        .bg-striped-green {
            background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, #22c55e 10px, #22c55e 20px);
        }
      `}</style>
    </div>
  );
};


