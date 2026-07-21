import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { User } from "@/types";
import { Zap, MessageSquare, Activity, ArrowRight, Check, Clock, Layers } from "lucide-react";
import { api } from "@/lib/axios";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

interface AgentStats {
  activeTickets: number;
  resolvedToday: number;
  messagesSentToday: number;
  recentTickets: {
    id: string;
    ticketNumber: number;
    subject: string;
    status: string;
    priority: string;
    queueName: string;
    updatedAt: string;
  }[];
}

export const AgentDashboard: React.FC<{
  onNavigate?: (tab: string) => void;
  user?: User;
}> = ({ onNavigate, user }) => {
  // Stale-while-revalidate: instant render on module re-entry, silent refetch
  const cachedStats = getModuleCache<AgentStats>("dashboard:agent");
  const [stats, setStats] = useState<AgentStats | null>(cachedStats ?? null);
  const [loading, setLoading] = useState(!cachedStats);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const fetchAgentStats = async () => {
      try {
        const response = await api.get("/dashboard/agent-stats");
        if (response.data && response.data.data) {
          setStats(response.data.data);
          setModuleCache("dashboard:agent", response.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch agent stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAgentStats();
  }, []);

  const todayDate = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden font-sans">
      {/* 1. WELCOME HEADER */}
      <div className="bg-white dark:bg-reply-surface-dark border-b border-slate-200 dark:border-reply-border-dark px-4 sm:px-8 py-4 sm:py-6 shadow-sm z-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1 flex items-center gap-2">
              {t("dashboard.agent_greeting", "Hola")}, {user?.name?.split(" ")[0]}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {t("dashboard.agent_subtitle", "¡Vamos con todo hoy! Aquí tienes tu resumen personal.")}
            </p>
          </div>
          <div className="shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-reply-border-dark">
              <Activity className="w-4 h-4 text-orange-500 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 lowercase first-letter:uppercase whitespace-nowrap">
                {todayDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8">
        {/* 2. PERSONAL METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Active Tickets (Focus) */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-900/20 relative overflow-hidden group hover:shadow-xl transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
              <MessageSquare className="w-24 h-24 text-white" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2 opacity-90">
                <Layers className="w-5 h-5" />
                <span className="text-sm font-medium uppercase tracking-wide">
                  {t("dashboard.inbox_title", "En tu bandeja")}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold">
                  {loading ? "-" : stats?.activeTickets || 0}
                </span>
                <span className="text-sm opacity-80">{t("dashboard.active_tickets", "tickets activos")}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-white/20">
                <button
                  onClick={() => onNavigate?.("tickets")}
                  className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded transition-colors flex items-center gap-2 w-fit"
                >
                  {t("dashboard.go_to_tickets", "Ir a mis tickets")} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Resolved Today (Motivation) */}
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-6 border-l-4 border-emerald-500 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Check className="w-6 h-6" />
              </div>
              {(stats?.resolvedToday && stats.resolvedToday > 0 && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full animate-pulse">
                  {t("dashboard.well_done", "¡Bien hecho!")}
                </span>
              )) ||
                null}
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.resolved_today", "Resueltos Hoy")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-slate-900 dark:text-white">
                  {loading ? "-" : stats?.resolvedToday || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Messages-ESent (Output) */}
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl p-6 border-l-4 border-blue-500 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                <Zap className="w-6 h-6" />
              </div>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {t("dashboard.messages_sent", "Mensajes Enviados")}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-slate-900 dark:text-white">
                  {loading ? "-" : stats?.messagesSentToday || 0}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {t("dashboard.high_activity", "Alto nivel de actividad")}
              </p>
            </div>
          </div>
        </div>

        {/* 3. RECENT ACTIVITY LIST */}
        <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-sm border border-slate-200 dark:border-reply-border-dark p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            {t("dashboard.recent_activity", "Vistos recientemente")}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">{t("dashboard.table_ticket", "Ticket")}</th>
                  <th className="px-4 py-3">{t("dashboard.table_status", "Estado")}</th>
                  <th className="px-4 py-3">{t("dashboard.table_priority", "Prioridad")}</th>
                  <th className="px-4 py-3">{t("dashboard.table_queue", "Cola")}</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">
                    {t("dashboard.table_updated", "Actualizado")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      {t("common.loading", "Cargando...")}
                    </td>
                  </tr>
                ) : stats?.recentTickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      {t("dashboard.no_recent_activity", "No hay actividad reciente")}
                    </td>
                  </tr>
                ) : (
                  stats?.recentTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        #{ticket.ticketNumber} - {ticket.subject}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold
                          ${
                            ticket.status === "OPEN"
                              ? "bg-blue-100 text-blue-700"
                              : ticket.status === "IN_PROGRESS"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {ticket.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold
                          ${
                            ticket.priority === "URGENT"
                              ? "bg-rose-100 text-rose-700"
                              : ticket.priority === "HIGH"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {ticket.queueName}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {new Date(ticket.updatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
