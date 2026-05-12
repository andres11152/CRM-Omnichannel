import React from "react";
import { useTranslation } from "react-i18next";
import { type TeamAgent } from "./types";
import { Users, Activity, Star, Clock, Zap } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: "blue" | "green" | "yellow" | "purple" | "red" | "emerald";
  trend?: string;
}

/**
 * TEAM METRICS COMPONENT
 * Displays summary statistics cards for the team
 */
export const TeamMetrics: React.FC<{ agents: TeamAgent[] }> = ({ agents }) => {
  const { t } = useTranslation();
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
    <div className="px-4 md:px-8 py-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      <MetricCard
        title={t("team.metrics.total_agents", "Total Agentes")}
        value={totalAgents}
        icon={<Users size={20} />}
        color="blue"
      />
      <MetricCard
        title={t("team.metrics.online_now", "Online Ahora")}
        value={onlineAgents}
        icon={<Activity size={20} />}
        color="green"
      />
      <MetricCard
        title={t("team.metrics.avg_csat", "CSAT Promedio")}
        value={avgCsat}
        icon={<Star size={20} />}
        color="yellow"
        trend="+2.4%"
      />
      <MetricCard
        title={t("team.metrics.avg_frt", "Tiempo Resp. (FRT)")}
        value={`${avgFrt} min`}
        icon={<Clock size={20} />}
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
  trend,
}) => {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20",
    yellow: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20",
    purple: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-500/20",
    red: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-500/20",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20",
  };

  const iconBgClasses = {
    blue: "bg-blue-600 dark:bg-blue-500",
    green: "bg-emerald-600 dark:bg-emerald-500",
    yellow: "bg-amber-600 dark:bg-amber-500",
    purple: "bg-indigo-600 dark:bg-indigo-500",
    red: "bg-rose-600 dark:bg-rose-500",
    emerald: "bg-emerald-600 dark:bg-emerald-500",
  };

  return (
    <div className={`relative overflow-hidden bg-white dark:bg-reply-panel-dark p-6 rounded-2xl border ${colorClasses[color]} shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group`}>
      {/* Decorative Gradient Background */}
      <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-[0.03] group-hover:opacity-[0.07] transition-opacity ${iconBgClasses[color]}`} />
      
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl text-white shadow-lg ${iconBgClasses[color]} transform group-hover:rotate-6 transition-transform duration-300`}>
          {icon}
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600">
            <Zap size={10} className="fill-current" />
            {trend}
          </span>
        )}
      </div>

      <div className="relative z-10">
        <div className="text-3xl font-black text-gray-900 dark:text-white mb-1 tracking-tight">
          {value}
        </div>
        <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.1em]">
          {title}
        </div>
      </div>
    </div>
  );
};


