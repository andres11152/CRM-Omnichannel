import React, { useMemo } from "react";
import { HeatmapData } from "@/types";
import { Activity } from "lucide-react";

interface Props {
  data: HeatmapData[];
}

export const HeatmapChart: React.FC<Props> = ({ data }) => {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Maximum value for intensity calculation
  const maxVal = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return Math.max(...data.map((d) => d.value));
  }, [data]);

  const totalMessages = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data],
  );

  // Create a fast lookup matrix [day][hour]
  const matrix = useMemo(() => {
    const m = Array(7).fill(0).map(() => Array(24).fill(0));
    (data || []).forEach((d) => {
      if (d.day >= 0 && d.day <= 6 && d.hour >= 0 && d.hour <= 23) {
        m[d.day][d.hour] = d.value;
      }
    });
    return m;
  }, [data]);

  // Get color based on intensity
  const getColor = (value: number) => {
    if (value === 0) return "bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800";
    
    const intensity = value / maxVal;
    if (intensity < 0.25) return "bg-blue-200 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-800/50";
    if (intensity < 0.5) return "bg-blue-400 dark:bg-blue-700/60 border border-blue-500 dark:border-blue-600/50";
    if (intensity < 0.75) return "bg-blue-600 dark:bg-blue-500 border border-blue-700 dark:border-blue-400";
    return "bg-blue-800 dark:bg-blue-400 border border-blue-900 dark:border-blue-300";
  };

  return (
    <div className="h-96 bg-white dark:bg-reply-surface-dark rounded-2xl p-5 border border-gray-100 dark:border-gray-800/60 shadow-sm flex flex-col">
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <span>Mapa de Calor: Volumen de Mensajes</span>
        <span className="ml-auto text-xs font-medium text-gray-400 dark:text-gray-500">
          {totalMessages.toLocaleString()} mensajes totales
        </span>
      </h3>

      <div className="flex-1 flex flex-col min-h-0 overflow-x-auto overflow-y-hidden scrollbar-thin pb-2">
        <div className="min-w-[700px] flex-1 flex flex-col">
          {/* X-Axis: Hours */}
          <div className="flex ml-12 mb-2">
            {hours.map((hour) => (
              <div key={hour} className="flex-1 text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                {hour}h
              </div>
            ))}
          </div>

          {/* Grid Area */}
          <div className="flex-1 flex flex-col gap-1.5">
            {days.map((dayName, dayIndex) => (
              <div key={dayName} className="flex-1 flex items-center">
                {/* Y-Axis: Day */}
                <div className="w-12 text-[11px] font-semibold text-gray-500 dark:text-gray-400 text-right pr-3">
                  {dayName}
                </div>
                
                {/* Cells */}
                <div className="flex-1 flex gap-1.5 h-full">
                  {hours.map((hour) => {
                    const value = matrix[dayIndex][hour];
                    return (
                      <div
                        key={`${dayIndex}-${hour}`}
                        className={`flex-1 rounded-sm relative group transition-colors duration-200 ${getColor(value)}`}
                      >
                        {/* Custom Tooltip */}
                        <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 pointer-events-none">
                          <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs py-1.5 px-2.5 rounded-lg shadow-xl whitespace-nowrap font-medium flex flex-col items-center gap-0.5">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold">{dayName} a las {hour}:00</span>
                            <span>{value} mensajes</span>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-white" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span>Menos</span>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800" />
          <div className="w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-800/50" />
          <div className="w-3 h-3 rounded-sm bg-blue-400 dark:bg-blue-700/60 border border-blue-500 dark:border-blue-600/50" />
          <div className="w-3 h-3 rounded-sm bg-blue-600 dark:bg-blue-500 border border-blue-700 dark:border-blue-400" />
          <div className="w-3 h-3 rounded-sm bg-blue-800 dark:bg-blue-400 border border-blue-900 dark:border-blue-300" />
        </div>
        <span>Más</span>
      </div>
    </div>
  );
};
