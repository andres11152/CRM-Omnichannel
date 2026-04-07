import React from "react";
import { type TeamAgent } from "./types";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: "blue" | "green" | "yellow" | "purple" | "red";
}

/**
 * TEAM METRICS COMPONENT
 * Displays summary statistics cards for the team
 */
export const TeamMetrics: React.FC<{ agents: TeamAgent[] }> = ({ agents }) => {
  // Calculate metrics
  const totalAgents = agents.filter((a) => !a.isAI).length;
  const onlineAgents = agents.filter(
    (a) => a.status === "online" && !a.isAI,
  ).length;

  const avgCsat =
    agents.length > 0
      ? (
          agents.reduce((acc, a) => acc + (a.performance?.csat || 0), 0) /
          agents.filter((a) => !a.isAI).length
        ).toFixed(1)
      : "0.0";

  const avgFrt =
    agents.length > 0
      ? Math.round(
          agents.reduce((acc, a) => acc + (a.speed?.frt || 0), 0) /
            agents.filter((a) => !a.isAI).length,
        )
      : 0;

  return (
    <div className="px-4 md:px-8 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <MetricCard
        title="Total Agentes"
        value={totalAgents}
        icon="[CONTACTS]"
        color="blue"
      />
      <MetricCard
        title="Online Ahora"
        value={onlineAgents}
        icon="[ONLINE]"
        color="green"
      />
      <MetricCard
        title="CSAT Promedio"
        value={`${avgCsat} ⭐`}
        icon="⭐"
        color="yellow"
      />
      <MetricCard
        title="Tiempo Resp. (FRT)"
        value={`${avgFrt} min`}
        icon=""
        color="purple"
      />
    </div>
  );
};

/**
 * METRIC CARD COMPONENT
 * Individual metric card with icon and value
 */
const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  color,
}) => {
  const colorClasses = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    green:
      "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    yellow:
      "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400",
    purple:
      "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    red: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  };

  return (
    <div className="bg-white dark:bg-reply-panel-dark p-5 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${colorClasses[color]}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-800 dark:text-white">
          {value}
        </div>
        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {title}
        </div>
      </div>
    </div>
  );
};


