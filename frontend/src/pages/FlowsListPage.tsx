import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "@/services/apiConfig";
import { ModuleHeader } from "../components/common/ModuleHeader";
import {
  Bot,
  Plus,
  Play,
  Pause,
  Trash2,
  Copy,
  Edit2,
  Search,
  MoreVertical,
  Workflow,
  GitBranch,
  Calendar,
  Zap,
} from "lucide-react";

import { Flow, FlowTriggerConfig } from "@/types";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

const FLOWS_CACHE_KEY = "flows:list";

export const FlowsListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Stale-while-revalidate: instant render on module re-entry, silent refetch
  const cachedFlows = getModuleCache<Flow[]>(FLOWS_CACHE_KEY);
  const [flows, setFlows] = useState<Flow[]>(cachedFlows ?? []);
  const [loading, setLoading] = useState(!cachedFlows);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchFlows();
  }, []);

  async function fetchFlows() {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/flows`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to fetch flows");

      const data = await response.json();
      const flowList = Array.isArray(data) ? data : [];
      setFlows(flowList);
      setModuleCache<Flow[]>(FLOWS_CACHE_KEY, flowList);
    } catch (error) {
      console.error("[FlowsList] Error:", error);
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/flows/${id}/toggle`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFlows();
    } catch (error) {
      console.error("[FlowsList] Toggle error:", error);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/flows/${id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFlows();
    } catch (error) {
      console.error("[FlowsList] Duplicate error:", error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("queues_config.toasts.confirm_delete"))) return;

    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/flows/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFlows();
    } catch (error) {
      console.error("[FlowsList] Delete error:", error);
    }
  }

  function getTriggerDisplay(trigger: FlowTriggerConfig | string | null | undefined) {
    if (!trigger) return t("common.unknown");
    if (typeof trigger === "string") return trigger;
    
    if (trigger.keyword) return `${t("chatbot.trigger_keyword")}: ${trigger.keyword}`;
    if (trigger.pattern) return `${t("chatbot.trigger_pattern")}: ${trigger.pattern}`;
    if (trigger.event) return `${t("chatbot.trigger_event")}: ${trigger.event}`;
    
    return t("ai_config.nav.config");
  }

  function formatDate(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return t("message_list.today");
    if (days === 1) return t("message_list.yesterday");
    if (days < 7) return `${days} ${t("tenants.metrics.days_remaining").toLowerCase()}`;
    return new Date(date).toLocaleDateString();
  }

  const filteredFlows = flows.filter((flow) =>
    flow.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-reply-bg dark:bg-reply-bg-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200">
      <ModuleHeader
        title={t("navigation.flows")}
        description={t("ai_config.description")}
        icon={<Bot className="w-8 h-8 text-white" />}
        gradient="from-blue-600 to-indigo-600 dark:from-blue-800 dark:to-indigo-800"
        stats={{
          label: t("ai_config.total_agents"),
          value: flows.length,
        }}
        action={
          <button
            onClick={() => navigate("/chatbot/flujos/nuevo")}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl font-bold text-sm backdrop-blur-sm transition-all shadow-lg border border-white/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="inline">{t("chatbot.new_flow")}</span>
          </button>
        }
      />

      {/* SEARCH & FILTER BAR */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-reply-surface-dark/80 backdrop-blur-xl border-b border-gray-100 dark:border-reply-border-dark px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="relative w-full sm:flex-1 max-w-md group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder={t("common.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 dark:bg-reply-bg-dark border-none rounded-xl py-3 pl-11 pr-4 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-gray-400 dark:text-white"
            />
          </div>
          <div className="w-full sm:w-auto text-center sm:text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest sm:block">
            {filteredFlows.length} {t("common.results")}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8 flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          {/* Empty State */}
          {flows.length === 0 ? (
            <div className="bg-white dark:bg-reply-panel-dark rounded-[2rem] p-16 text-center shadow-xl border border-gray-100 dark:border-reply-border-dark flex flex-col items-center">
              <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                <Workflow className="w-12 h-12 text-blue-500" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">
                {t("chatbot.empty_title")}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md mx-auto">
                {t("chatbot.empty_desc")}
              </p>
              <button
                onClick={() => navigate("/chatbot/flujos/nuevo")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-blue-600/20 inline-flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                {t("chatbot.create_now")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFlows.map((flow) => (
                <div
                  key={flow.id}
                  className="group bg-white dark:bg-reply-panel-dark rounded-2xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 dark:border-reply-border-dark relative overflow-hidden"
                >
                  {/* Status Indicator Bar */}
                  <div
                    className={`absolute top-0 left-0 w-full h-1 ${
                      flow.isActive ? "bg-emerald-500" : "bg-gray-200"
                    }`}
                  />

                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                      <GitBranch className="w-6 h-6" />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDuplicate(flow.id)}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(flow.id)}
                        className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {flow.name}
                  </h3>

                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                        flow.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {flow.isActive ? "Active" : "Inactive"}
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(flow.updatedAt)}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 mb-4 border border-gray-100 dark:border-gray-700/50">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" /> Trigger
                    </p>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono truncate">
                      {getTriggerDisplay(flow.triggerConfig)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-reply-border-dark">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Workflow className="w-3 h-3" />
                      {flow.nodes?.length || 0} nodes
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggle(flow.id)}
                        className={`p-2 rounded-lg transition-all ${
                          flow.isActive
                            ? "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                            : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400"
                        }`}
                        title={flow.isActive ? "Pausar" : "Activar"}
                      >
                        {flow.isActive ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          navigate(`/chatbot/flujos/${flow.id}/editar`)
                        }
                        className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
                      >
                        {t("common.edit")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
