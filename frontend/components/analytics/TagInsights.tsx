import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { TagData } from "../../types";

interface Props {
  data: TagData[];
}

export const TagInsights: React.FC<Props> = ({ data }) => {
  return (
    <div className="h-80 bg-white dark:bg-[#111b21] rounded-xl p-4 border border-gray-100 dark:border-gray-800">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
        <span className="text-xl">🏷️</span> Etiquetas Más Usadas
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="#E5E7EB"
          />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="tag"
            width={80}
            tick={{ fontSize: 11, fill: "#6B7280" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.05)" }}
            contentStyle={{
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          />
          <Bar
            dataKey="count"
            fill="#8B5CF6"
            radius={[0, 4, 4, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
