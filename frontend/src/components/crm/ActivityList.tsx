import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Activity } from "@/types/crm";
import {
  getActivities,
  deleteActivity,
  updateActivity,
} from "@/services/crmService";
import { ActivityModal } from "./ActivityModal";
import { ModuleHeader } from "../common/ModuleHeader";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";
import {
  Calendar,
  Search,
  Trash2,
  CheckCircle2,
  Circle,
  Settings,
  Phone,
  Mail,
  Users,
  CheckSquare,
  FileText,
} from "lucide-react";

const ACTIVITIES_CACHE_KEY = "activities:default-view";

export const ActivityList: React.FC = () => {
  const { t } = useTranslation();
  // Stale-while-revalidate: instant render on module re-entry, silent refetch behind it.
  const cachedActivities = getModuleCache<Activity[]>(ACTIVITIES_CACHE_KEY);
  const [activities, setActivities] = useState<Activity[]>(cachedActivities ?? []);
  const [loading, setLoading] = useState(!cachedActivities);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<
    Activity | undefined
  >(undefined);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchActivities = async () => {
    if (!getModuleCache<Activity[]>(ACTIVITIES_CACHE_KEY)) {
      setLoading(true);
    }
    try {
      const data = await getActivities();
      const list = data.activities || [];
      setActivities(list);
      setModuleCache<Activity[]>(ACTIVITIES_CACHE_KEY, list);
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const handleDelete = (id: string) => {
    toast(t("activities_page.confirm_delete"), {
      description: t("activities_page.confirm_delete_desc"),
      action: {
        label: t("common.delete"),
        onClick: async () => {
          const toastId = toast.loading(t("activities_page.deleting"));
          try {
            await deleteActivity(id);
            toast.success(t("activities_page.deleted"), { id: toastId });
            await fetchActivities();
          } catch (error) {
            console.error("Error deleting activity:", error);
            toast.error(t("activities_page.delete_error"), { id: toastId });
          }
        },
      },
      cancel: {
        label: t("common.cancel"),
        onClick: () => {},
      },
      duration: 5000,
    });
  };

  const handleStatusToggle = async (activity: Activity) => {
    try {
      const newStatus = activity.status === "PENDING" ? "COMPLETED" : "PENDING";
      await updateActivity(activity.id, { status: newStatus });
      fetchActivities();
    } catch (error) {
      console.error("Error updating activity status:", error);
    }
  };

  const handleEdit = (activity: Activity) => {
    setSelectedActivity(activity);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedActivity(undefined);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedActivity(undefined);
    fetchActivities();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "CALL":
        return <Phone className="w-3.5 h-3.5" />;
      case "EMAIL":
        return <Mail className="w-3.5 h-3.5" />;
      case "MEETING":
        return <Users className="w-3.5 h-3.5" />;
      case "TASK":
        return <CheckSquare className="w-3.5 h-3.5" />;
      default: // NOTE
        return <FileText className="w-3.5 h-3.5" />;
    }
  };

  const getTypeLabel = (type: string) => {
    return t(`crm.activities.types.${type.toLowerCase()}`, type);
  };

  const filteredActivities = activities.filter(
    (activity) =>
      activity.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.assignedTo?.name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      getTypeLabel(activity.type)
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      <ModuleHeader
        title={t("activities_page.title")}
        description={t("activities_page.description")}
        icon={<Calendar className="w-8 h-8 text-white" />}
        gradient="from-orange-600 to-amber-600 dark:from-orange-800 dark:to-amber-800"
        stats={{
          label: t("activities_page.stat_pending"),
          value: activities.filter((a) => a.status === "PENDING").length,
        }}
        action={
          <button
            onClick={handleCreate}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            {t("activities_page.new_activity")}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* TOOLBAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-reply-bg/80 dark:bg-reply-bg-dark/80 backdrop-blur-xl py-2">
            <div className="relative group flex-1 max-w-2xl">
              <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("activities_page.search_placeholder")}
                className="w-full pl-12 pr-6 py-4 bg-white dark:bg-reply-panel-dark border border-gray-100 dark:border-reply-border-dark rounded-2xl shadow-sm focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-100 dark:border-reply-border-dark shadow-sm text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                {t("activities_page.pending_tasks", {
                  count: activities.filter((a) => a.status === "PENDING").length,
                })}
              </div>
            </div>
          </div>

          {/* CONTENT AREA */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-64 bg-white dark:bg-reply-panel-dark rounded-[2.5rem] border border-gray-100 dark:border-reply-border-dark animate-pulse"
                />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-reply-panel-dark rounded-[3rem] border border-dashed border-gray-200 dark:border-reply-border-dark shadow-inner">
              <div className="w-24 h-24 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Calendar className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                {t("activities_page.empty_title")}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-base">
                {t("activities_page.empty_desc")}
              </p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-reply-panel-dark rounded-[3rem] border border-dashed border-gray-200 dark:border-reply-border-dark shadow-inner">
              <div className="w-24 h-24 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                {t("activities_page.no_matches_title")}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-base">
                {t("activities_page.no_matches_desc", { term: searchTerm })}
              </p>
            </div>
          ) : (
            <>
              {/* MOBILE CARDS */}
              <div className="grid grid-cols-1 gap-4 md:hidden pb-10">
                {filteredActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className={`bg-white dark:bg-reply-surface-dark p-6 rounded-[2.5rem] border border-gray-100 dark:border-reply-border-dark shadow-sm transition-all relative overflow-hidden ${activity.status === "COMPLETED" ? "opacity-60 saturate-[0.2]" : ""}`}
                  >
                    <div className="flex items-start gap-4 mb-5">
                      <button
                        onClick={() => handleStatusToggle(activity)}
                        className={`mt-1.5 transform transition-all active:scale-90 ${activity.status === "COMPLETED" ? "text-emerald-500" : "text-gray-300"}`}
                      >
                        {activity.status === "COMPLETED" ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : (
                          <Circle className="w-6 h-6" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <h4
                          className={`text-lg font-black text-gray-900 dark:text-white truncate ${activity.status === "COMPLETED" ? "line-through" : ""}`}
                        >
                          {activity.subject}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                            {getTypeIcon(activity.type)}
                            {getTypeLabel(activity.type)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mb-6 bg-reply-bg/50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-reply-border-dark">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400 font-bold uppercase tracking-tighter">
                          {t("activities_page.due_label")}
                        </span>
                        <span
                          className={`font-black ${new Date(activity.dueDate || "") < new Date() && activity.status !== "COMPLETED" ? "text-red-500" : "text-gray-900 dark:text-white"}`}
                        >
                          {activity.dueDate
                            ? new Date(activity.dueDate).toLocaleString([], {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : t("activities_page.no_date")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400 font-bold uppercase tracking-tighter">
                          {t("activities_page.assignee_label")}
                        </span>
                        <span className="text-gray-900 dark:text-white font-black">
                          {activity.assignedTo?.name || t("crm.activities.unassigned")}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(activity)}
                        className="flex-1 py-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-reply-border-dark hover:bg-reply-bg dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-[1.25rem] font-bold text-sm transition-all shadow-sm"
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        onClick={() => handleDelete(activity.id)}
                        className="p-4 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-[1.25rem] hover:bg-red-100 transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP TABLE */}
              <div className="hidden md:block bg-white dark:bg-reply-surface-dark rounded-[3rem] border border-gray-100 dark:border-reply-border-dark shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-reply-bg/50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 text-[10px] uppercase font-black tracking-[0.2em]">
                      <th className="px-8 py-8 w-16"></th>
                      <th className="px-6 py-8">{t("activities_page.table.activity")}</th>
                      <th className="px-6 py-8">{t("activities_page.table.type")}</th>
                      <th className="px-6 py-8">{t("activities_page.table.due")}</th>
                      <th className="px-6 py-8">{t("activities_page.table.assignee")}</th>
                      <th className="px-8 py-8 text-right">{t("activities_page.table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {filteredActivities.map((activity) => (
                      <tr
                        key={activity.id}
                        className={`hover:bg-reply-bg/50 dark:hover:bg-orange-500/[0.02] transition-all group ${activity.status === "COMPLETED" ? "opacity-50 grayscale" : ""}`}
                      >
                        <td className="px-8 py-6 text-center">
                          <button
                            onClick={() => handleStatusToggle(activity)}
                            className={`transform transition-all active:scale-75 ${activity.status === "COMPLETED" ? "text-emerald-500" : "text-gray-200 hover:text-gray-300 dark:text-gray-700 dark:hover:text-gray-600"}`}
                          >
                            {activity.status === "COMPLETED" ? (
                              <CheckCircle2 className="w-6 h-6" />
                            ) : (
                              <Circle className="w-6 h-6" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-6 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <div
                              className={`text-base font-black text-gray-900 dark:text-white mb-0.5 tracking-tight ${activity.status === "COMPLETED" ? "line-through decoration-emerald-500/50" : ""}`}
                            >
                              {activity.subject}
                            </div>
                            <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest truncate max-w-[200px]">
                              {activity.description ||
                                t("activities_page.no_description")}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6 whitespace-nowrap">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-reply-bg dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-reply-border-dark w-fit">
                            <span className="text-orange-500">
                              {getTypeIcon(activity.type)}
                            </span>
                            <span className="text-[10px] font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest">
                              {getTypeLabel(activity.type)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex flex-col gap-1">
                            <div
                              className={`text-sm font-black tracking-tighter ${new Date(activity.dueDate || "") < new Date() && activity.status !== "COMPLETED" ? "text-red-500 animate-pulse" : "text-gray-900 dark:text-white"}`}
                            >
                              {activity.dueDate
                                ? new Date(activity.dueDate).toLocaleString(
                                    [],
                                    {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    },
                                  )
                                : "-"}
                            </div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase italic">
                              {activity.dueDate
                                ? new Date(activity.dueDate).toLocaleString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )
                                : t("activities_page.no_deadline")}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-black text-gray-500">
                              {activity.assignedTo?.name
                                ?.charAt(0)
                                .toUpperCase() || "?"}
                            </div>
                            <div className="text-sm font-bold text-gray-600 dark:text-gray-300">
                              {activity.assignedTo?.name || t("crm.activities.unassigned")}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 whitespace-nowrap text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => handleEdit(activity)}
                              className="p-3 bg-white dark:bg-gray-800 hover:bg-reply-bg dark:hover:bg-gray-700 text-gray-400 hover:text-orange-500 rounded-2xl transition-all shadow-sm border border-gray-100 dark:border-reply-border-dark active:scale-90"
                            >
                              <Settings className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(activity.id)}
                              className="p-3 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-300 hover:text-red-500 rounded-2xl transition-all active:scale-95"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {isModalOpen && (
        <ActivityModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleModalClose}
          activity={selectedActivity}
        />
      )}
    </div>
  );
};


