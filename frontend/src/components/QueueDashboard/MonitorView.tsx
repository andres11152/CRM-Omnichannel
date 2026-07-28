import React from "react";
import { useTranslation } from "react-i18next";
import { Agent } from "@/types";
import { AgentCard } from "./AgentCard";
import { TicketCard, IncomingTicket } from "./TicketCard";

export const MonitorView = ({
  agents,
  tickets,
  onTicketDrop,
  onConfigClick,
}: {
  agents: Agent[];
  tickets: IncomingTicket[];
  onTicketDrop: (agentId: string, ticketId: string) => void;
  onConfigClick: (agent: Agent) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex-1 p-8 overflow-hidden flex flex-col gap-6">
      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* AI Agents Online */}
        <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {t("queue_dashboard.monitor.ai_agents_online", "Agentes IA Online")}
            </p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {agents.filter((a) => (a as Agent & { isAI?: boolean }).isAI).length}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {t("queue_dashboard.monitor.agents_online", "Agentes Online")}
            </p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {
                agents.filter(
                  (a) => a.status === "online" && !(a as Agent & { isAI?: boolean }).isAI,
                ).length
              }{" "}
              <span className="text-sm font-normal text-gray-400">
                / {agents.filter((a) => !(a as Agent & { isAI?: boolean }).isAI).length}
              </span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm flex items-center gap-4">
          <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {t("queue_dashboard.monitor.avg_wait_time", "Tiempo Promedio Espera")}
            </p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {tickets.length > 0
                ? Math.round(
                    tickets.reduce((acc, t) => acc + (t.waitTime || 0), 0) / tickets.length,
                  )
                : 0}{" "}
              <span className="text-sm font-normal text-gray-400">min</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-100 dark:bg-rose-900/30 rounded-lg text-rose-600 dark:text-rose-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {t("queue_dashboard.tickets_in_queue", "Tickets en Cola")}
            </p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {tickets.length}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-8 overflow-hidden">
        {/* Agents List */}
        <div className="w-2/3 flex flex-col gap-4 overflow-hidden">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              {t("queue_dashboard.monitor.active_agents", "Agentes Activos")}
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">
                {agents.length}
              </span>
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {agents.length === 0 ? (
              <div className="text-center text-gray-500 py-10 bg-reply-bg dark:bg-reply-surface-dark rounded-xl border border-dashed border-gray-300 dark:border-reply-border-dark">
                {t("queue_dashboard.monitor.no_agents_connected", "No hay agentes conectados")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onDrop={onTicketDrop}
                    onConfigClick={onConfigClick}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Queue List */}
        <div className="w-1/3 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-reply-bg/50 dark:bg-reply-surface-dark/50">
              <h3 className="font-bold text-gray-800 dark:text-white">
                {t("queue_dashboard.monitor.wait_queue", "Cola de Espera")}
              </h3>
              <span className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-xs font-bold px-2 py-0.5 rounded-full">
                {tickets.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-reply-bg/30 dark:bg-reply-bg-dark/30">
              {tickets.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                  <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p>{t("queue_dashboard.monitor.all_caught_up", "¡Todo al día!")}</p>
                  <p className="text-xs opacity-70">{t("queue_dashboard.monitor.no_tickets_waiting", "No hay tickets en espera")}</p>
                </div>
              ) : (
                tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
