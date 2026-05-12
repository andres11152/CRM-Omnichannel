import React from "react";
import {
  Activity,
  Plus,
  Trash,
  Edit,
  LogIn,
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ActivityItem {
  id: string;
  action: string;
  entity: string;
  description: string;
  timestamp: string;
  user?: { name: string };
  company?: { name: string };
  metadata?: { severity: "info" | "success" | "warning" | "error" | "default" };
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  loading?: boolean;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  loading,
}) => {
  const { t, i18n } = useTranslation();
  const getIcon = (action: string) => {
    switch (action) {
      case "CREATE":
        return <Plus className="w-4 h-4 text-emerald-600" />;
      case "UPDATE":
        return <Edit className="w-4 h-4 text-blue-600" />;
      case "DELETE":
        return <Trash className="w-4 h-4 text-red-600" />;
      case "LOGIN":
        return <LogIn className="w-4 h-4 text-purple-600" />;
      case "PAYMENT":
        return <CreditCard className="w-4 h-4 text-green-600" />;
      case "ALERT":
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getBgColor = (action: string) => {
    switch (action) {
      case "CREATE":
        return "bg-emerald-100 dark:bg-emerald-900/30";
      case "UPDATE":
        return "bg-blue-100 dark:bg-blue-900/30";
      case "DELETE":
        return "bg-red-100 dark:bg-red-900/30";
      case "LOGIN":
        return "bg-purple-100 dark:bg-purple-900/30";
      case "PAYMENT":
        return "bg-green-100 dark:bg-green-900/30";
      case "ALERT":
        return "bg-orange-100 dark:bg-orange-900/30";
      default:
        return "bg-gray-100 dark:bg-gray-800";
    }
  };

  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return t("dashboard.activity_feed.few_seconds", "hace unos segundos");
    if (diffInSeconds < 3600)
      return t("dashboard.activity_feed.minutes_ago", { count: Math.floor(diffInSeconds / 60), defaultValue: `hace ${Math.floor(diffInSeconds / 60)} min` });
    if (diffInSeconds < 86400)
      return t("dashboard.activity_feed.hours_ago", { count: Math.floor(diffInSeconds / 3600), defaultValue: `hace ${Math.floor(diffInSeconds / 3600)} h` });
    return date.toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-none" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
        <Clock className="w-12 h-12 mb-3 opacity-50" />
        <p>{t("dashboard.activity_feed.no_activity", "No hay actividad reciente registrada.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 relative pr-2">
      {/* Live indicator line handled via CSS in item mapping if needed, or simple list */}
      <div className="space-y-4">
        {Array.isArray(activities) &&
          activities.map((item) => (
          <div
            key={item.id}
            className="group flex items-start gap-4 p-3 rounded-xl hover:bg-white/50 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700"
          >
            {/* Icon Badge */}
            <div
              className={`w-10 h-10 rounded-full ${getBgColor(item.action)} flex items-center justify-center flex-none shadow-sm`}
            >
              {getIcon(item.action)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate pr-2">
                  {item.description}
                </h4>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-none">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                <span className="font-medium text-gray-600 dark:text-gray-300">
                  {item.user?.name || t("dashboard.activity_feed.system", "Sistema")}
                </span>
                {" • "}
                <span className="text-indigo-600 dark:text-indigo-400">
                  {item.company?.name || t("dashboard.activity_feed.global", "Global")}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
