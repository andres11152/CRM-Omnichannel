import React from "react";
import { useTranslation } from "react-i18next";
import { Agent } from "@/types";

export const AgentCard = ({
  agent,
  onDrop,
  onConfigClick,
}: {
  agent: Agent;
  onDrop: (agentId: string, ticketId: string) => void;
  onConfigClick: (agent: Agent) => void;
}) => {
  const { t } = useTranslation();
  const maxCap =
    agent.maxCapacity && agent.maxCapacity > 0 ? agent.maxCapacity : 5;
  const loadPercentage = Math.min((agent.currentLoad / maxCap) * 100, 100);

  let progressColor = "bg-emerald-500";
  if (loadPercentage > 60) progressColor = "bg-amber-500";
  if (loadPercentage >= 90) progressColor = "bg-rose-500";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData("ticketId");
    if (ticketId) {
      onDrop(agent.id, ticketId);
    }
  };

  // Mock "Connected since" if online and missing
  const connectionTime =
    agent.status === "online"
      ? agent.lastSeen
        ? new Date(agent.lastSeen).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "08:30 AM" // Enterprise touch: realistic default or use "Ahora"
      : null;

  return (
    <div
      className={`group bg-white dark:bg-reply-panel-dark p-5 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm hover:shadow-lg transition-all duration-300 ${
        agent.currentLoad >= maxCap
          ? "ring-2 ring-red-100 dark:ring-red-900/20"
          : ""
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          {/* Avatar with Status Ring */}
          <div className="relative">
            <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-gray-100 to-gray-300 dark:from-gray-700 dark:to-gray-600">
              <img
                src={
                  agent.avatar ||
                  `https://ui-avatars.com/api/?name=${agent.name}&background=random`
                }
                alt={agent.name}
                className="w-full h-full rounded-full object-cover border-2 border-white dark:border-reply-panel-dark"
              />
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-5 h-5 border-2 border-white dark:border-reply-panel-dark rounded-full flex items-center justify-center ${
                agent.status === "online"
                  ? "bg-emerald-500"
                  : agent.status === "busy"
                    ? "bg-red-500"
                    : "bg-gray-400"
              }`}
            >
              {agent.status === "online" && (
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-base">
              {agent.name}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                  agent.status === "online"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                }`}
              >
                {agent.status === "online" ? t("queue_dashboard.agent_card.connected", "Conectado") : t("queue_dashboard.agent_card.disconnected", "Desconectado")}
              </span>
              {connectionTime && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {connectionTime}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Config / Transfer Actions */}
        <button
          onClick={() => onConfigClick(agent)}
          className={`text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2 rounded-lg hover:bg-reply-bg dark:hover:bg-gray-800 transition-colors ${(agent as Agent & { isAI?: boolean }).isAI ? "hidden" : ""}`}
          title={t("queue_dashboard.agent_card.configure_queues", "Configurar Colas")}
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
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-reply-bg dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-reply-border-dark/50">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">
            {t("queue_dashboard.agent_card.active_chats", "Chats Activos")}
          </span>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
            {agent.currentLoad}
          </p>
        </div>
        <div className="bg-reply-bg dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-reply-border-dark/50">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">
            {t("queue_dashboard.agent_card.resolved_today", "Resueltos Hoy")}
          </span>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
            {(agent as Agent & { resolvedToday?: number }).resolvedToday || 0}
          </p>
        </div>
      </div>

      {/* Capacity Bar */}
      <div>
        <div className="flex justify-between text-xs font-medium mb-1.5">
          <span className="text-gray-500 dark:text-gray-400">
            {t("queue_dashboard.agent_card.capacity", "Capacidad ({{pct}}%)", { pct: loadPercentage.toFixed(0) })}
          </span>
          <span
            className={`${loadPercentage >= 90 ? "text-red-500 font-bold" : "text-gray-700 dark:text-gray-300"}`}
          >
            {agent.currentLoad} / {maxCap}
          </span>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden border border-gray-100 dark:border-gray-600">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out shadow-sm ${progressColor} ${loadPercentage >= 100 ? "animate-pulse" : ""}`}
            style={{ width: `${loadPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Tags / Info */}
      <div className="mt-4 flex flex-wrap gap-2">
        {agent.department && (
          <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
            {typeof agent.department === "object"
              ? (agent.department as { name: string }).name
              : agent.department}
          </span>
        )}
        <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 uppercase">
          {agent.role || t("queue_dashboard.agent_card.agent_role_fallback", "Agente")}
        </span>
      </div>
    </div>
  );
};
