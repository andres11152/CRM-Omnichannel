import React from "react";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

import { HeatmapData } from "@/types";

interface Props {
  data: HeatmapData[];
}

export const HeatmapChart: React.FC<Props> = ({ data }) => {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sb"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Transform data for scatter plot simulation of heatmap
  // X: Hour (0-23), Y: Day (0-6), Z: Value (Intensity)
  const chartData = (data || []).map((d) => ({
    x: d.hour,
    y: d.day,
    z: d.value,
    ...d,
  }));

  const maxVal = Math.max(...chartData.map((d) => d.value));

  interface RechartsSquareProps {
    cx: number;
    cy: number;
    payload: { z: number; [key: string]: unknown };
    [key: string]: unknown;
  }

  const renderSquare = (props: RechartsSquareProps) => {
    const { cx, cy, payload } = props;
    // Calculate intensity based on max value
    const intensity = maxVal > 0 ? payload.z / maxVal : 0;

    // Color interpolation: White -> Blue
    const opacity = 0.2 + intensity * 0.8;

    return (
      <rect
        x={cx - 10}
        y={cy - 10}
        width={20}
        height={20}
        fill={`rgba(59, 130, 246, ${opacity})`}
        rx={4}
      />
    );
  };

  return (
    <div className="h-80 w-full bg-white dark:bg-reply-surface-dark rounded-xl p-4 border border-gray-100 dark:border-reply-border-dark">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
        <span className="text-xl">🔥</span> Mapa de Calor: Volumen de Mensajes
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="Hora"
            domain={[0, 23]}
            tickCount={24}
            tick={{ fontSize: 10 }}
            tickFormatter={(val) => `${val}h`}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Día"
            domain={[0, 6]}
            tickCount={7}
            tick={{ fontSize: 11 }}
            tickFormatter={(val) => days[val]}
          />
          <ZAxis type="number" dataKey="z" range={[0, 500]} name="Mensajes" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            wrapperStyle={{ zIndex: 100 }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-reply-border-dark shadow-lg rounded text-xs">
                    <p className="font-bold">
                      {days[data.day]} a las {data.hour}:00
                    </p>
                    <p className="text-blue-600 dark:text-blue-400">
                      {data.value} mensajes
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Scatter
            data={chartData}
            shape={
              renderSquare as unknown as (props: unknown) => React.ReactElement
            }
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};
