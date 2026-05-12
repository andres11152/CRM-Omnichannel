import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { TagData } from "@/types";
import { Tags, Hash } from "lucide-react";

interface Props {
  data: TagData[];
}

export const TagInsights: React.FC<Props> = ({ data }) => {
  // Generate a smooth gradient of colors for the bars
  const colors = ["#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95"];

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { tag: string }; value: number }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-[#111b21] p-3 border border-gray-100 dark:border-gray-800 shadow-xl rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-3 h-3 text-violet-500" />
            <p className="font-bold text-gray-900 dark:text-white text-sm">
              {payload[0].payload.tag}
            </p>
          </div>
          <p className="text-violet-600 dark:text-violet-400 font-semibold text-xs ml-5">
            {payload[0].value} usos
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-96 bg-white dark:bg-[#111b21] rounded-2xl p-5 border border-gray-100 dark:border-gray-800/60 shadow-sm flex flex-col">
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
          <Tags className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        </div>
        Etiquetas Más Usadas
      </h3>

      <div className="flex-1 min-h-0">
        {(!data || data.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-3">
              <Tags className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Sin etiquetas</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[200px]">
              Aún no hay suficientes datos para mostrar el uso de etiquetas.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.slice(0, 5)} // Limit to top 5
              layout="vertical"
              margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={true}
                vertical={true}
                stroke="currentColor"
                className="text-gray-100 dark:text-gray-800"
              />
              <XAxis 
                type="number" 
                hide 
              />
              <YAxis
                type="category"
                dataKey="tag"
                width={80}
                tick={{ fontSize: 12, fill: "#8b5cf6", fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar
                dataKey="count"
                radius={[0, 6, 6, 0]}
                barSize={24}
              >
                {data.slice(0, 5).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};


