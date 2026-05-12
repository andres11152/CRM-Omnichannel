import React from "react";
import { useTranslation } from "react-i18next";
import {
  Inbox,
  Layers,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle,
} from "lucide-react";
import { User } from "@/types";
import { WorkspaceTab } from "@/hooks/useAgentWorkspace";

interface WorkspaceHeaderProps {
  user?: User | null;
  socketConnected: boolean;
  activeTab: WorkspaceTab;
  isSidebarOpen: boolean;
  myTicketsCount: number;
  queueTicketsCount: number;
  resolvedTodayCount: number;
  resolvedTotalCount: number;
  onTabChange: (tab: WorkspaceTab) => void;
  onToggleSidebar: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  user,
  socketConnected,
  activeTab,
  isSidebarOpen,
  myTicketsCount,
  queueTicketsCount,
  resolvedTodayCount,
  resolvedTotalCount,
  onTabChange,
  onToggleSidebar,
}) => {
  const { t } = useTranslation();

  const tabs: { id: WorkspaceTab; label: string; count: number }[] = [
    { id: "my_chats", label: t("workspace.my_chats", "Mi Bandeja"), count: myTicketsCount },
    { id: "queue", label: t("workspace.queue", "Cola de Espera"), count: queueTicketsCount },
    { id: "resolved", label: t("workspace.resolved", "Historial"), count: resolvedTotalCount },
  ];

  return (
    <div className="h-[64px] px-4 md:px-6 bg-white dark:bg-reply-surface-dark border-b border-gray-200/70 dark:border-reply-border-dark flex items-center justify-between z-40 shrink-0 shadow-sm">
      <div className="flex items-center gap-6 h-full">
        {/* Brand & Connection Status */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white leading-none">
                {t("workspace.agent_panel", "Panel de Agente")}
              </h2>
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${socketConnected ? "bg-emerald-400" : "bg-rose-400"}`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${socketConnected ? "bg-emerald-500" : "bg-rose-500"}`}
                />
              </span>
            </div>
            <span className="text-[10px] uppercase font-medium text-gray-500 dark:text-gray-400 mt-1 leading-none tracking-wider">
              {socketConnected ? t("workspace.online", "Online") : t("workspace.offline", "Desconectado")}
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 hidden md:block" />

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:flex gap-1 p-1 bg-gray-100 dark:bg-reply-panel-dark rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 flex items-center gap-2
                ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }
              `}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    activeTab === tab.id
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                      : "bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats - Desktop Only */}
      <div className="hidden lg:flex items-center gap-6 text-sm">
        <div className="flex flex-col items-center">
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400 leading-none">
            {myTicketsCount}
          </span>
          <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">
            {t("workspace.active", "Activos")}
          </span>
        </div>
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />
        <div className="flex flex-col items-center">
          <span className="text-xl font-bold text-orange-600 dark:text-orange-400 leading-none">
            {queueTicketsCount}
          </span>
          <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">
            {t("workspace.in_queue", "En Cola")}
          </span>
        </div>
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />
        <div className="flex flex-col items-center">
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">
            {resolvedTodayCount}
          </span>
          <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">
            {t("workspace.today", "Hoy")}
          </span>
        </div>
      </div>

      {/* Portal for additional actions */}
      <div
        id="header-actions-portal"
        className="lg:hidden flex-1 flex justify-end items-center px-2 min-w-0"
      />

      {/* RIGHT: Tools */}
      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
        {/* Mobile Tabs */}
        <div className="xl:hidden flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => onTabChange("my_chats")}
            className={`p-2 rounded-md transition-all ${activeTab === "my_chats" ? "bg-white dark:bg-gray-700 shadow text-indigo-600" : "text-gray-500"}`}
          >
            <Inbox className="w-5 h-5" />
          </button>
          <button
            onClick={() => onTabChange("queue")}
            className={`p-2 rounded-md transition-all ${activeTab === "queue" ? "bg-white dark:bg-gray-700 shadow text-orange-600" : "text-gray-500"}`}
          >
            <Layers className="w-5 h-5" />
          </button>
          <button
            onClick={() => onTabChange("resolved")}
            className={`p-2 rounded-md transition-all ${activeTab === "resolved" ? "bg-white dark:bg-gray-700 shadow text-green-600" : "text-gray-500"}`}
          >
            <CheckCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden md:block" />

        {/* Agent Profile */}
        {user && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-reply-bg dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-reply-border-dark">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {user.name?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[100px]">
                {user.name || t("workspace.agent", "Agente")}
              </span>
              <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {user.role === "ADMIN" ? "Admin" : t("workspace.agent", "Agente")}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={onToggleSidebar}
          className="hidden md:flex group p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
          title={isSidebarOpen ? t("workspace.hide_panel", "Ocultar panel") : t("workspace.show_panel", "Mostrar panel")}
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-5 h-5 group-hover:scale-90 transition-transform" />
          ) : (
            <PanelLeftOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
          )}
        </button>
      </div>
    </div>
  );
};
