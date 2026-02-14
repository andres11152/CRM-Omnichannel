import React from "react";
import { type TeamAgent } from "./types";

interface TeamTableProps {
  agents: TeamAgent[];
  loading: boolean;
  currentUser?: any;
  onEdit: (agent: TeamAgent) => void;
  onDelete: (id: string, name: string) => void;
  onCreateNew: () => void;
}

/**
 * TEAM TABLE COMPONENT
 * Displays the agents table with status, workload, performance metrics
 */
export const TeamTable: React.FC<TeamTableProps> = ({
  agents,
  loading,
  currentUser,
  onEdit,
  onDelete,
  onCreateNew,
}) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        Cargando equipo...
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-20 bg-white dark:bg-reply-panel-dark rounded-xl border border-dashed border-gray-300 dark:border-reply-border-dark">
        <div className="text-4xl mb-4">👋</div>
        <h3 className="text-xl font-bold text-gray-800 dark:text-white">
          Tu equipo está vacío
        </h3>
        <p className="text-gray-500 mb-6">
          Agrega tu primer agente para comenzar a atender tickets.
        </p>
        <button
          onClick={onCreateNew}
          className="text-indigo-600 font-bold hover:underline"
        >
          Crear Agente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 🖥️ DESKTOP TABLE VIEW */}
      <div className="hidden lg:block bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-reply-bg dark:bg-reply-surface-dark text-gray-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">
            <tr>
              <th className="px-6 py-4">Agente</th>
              <th className="px-6 py-4">Estado</th>
              <th className="px-6 py-4">Carga Actual</th>
              <th className="px-6 py-4">Rendimiento (Hoy)</th>
              <th className="px-6 py-4">Conectado</th>
              <th className="px-6 py-4">Tiempo Total (Hoy)</th>
              <th className="px-6 py-4">Velocidad (FRT)</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {agents.map((agent) => (
              <TeamTableRow
                key={agent.id}
                agent={agent}
                currentUser={currentUser}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 📱 MOBILE CARD VIEW */}
      <div className="lg:hidden space-y-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-100 dark:border-reply-border-dark shadow-sm space-y-4"
          >
            {/* Header: Avatar, Name, Status */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={
                    agent.avatar ||
                    `https://ui-avatars.com/api/?name=${agent.name}&background=random`
                  }
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border border-gray-100 dark:border-reply-border-dark"
                />
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    {agent.isOwner && "👑"}
                    {agent.name}
                  </h4>
                  <p className="text-[10px] text-gray-500 truncate max-w-[150px]">
                    {agent.email}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {agent.role === "Admin" ? (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 uppercase tracking-wide">
                        ADMIN
                      </span>
                    ) : agent.role === "Supervisor" ? (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 uppercase tracking-wide">
                        SUP
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gray-100 text-gray-600">
                        AGENT
                      </span>
                    )}
                    {agent.isAI && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                        🤖 IA
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    agent.status === "online"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  <span
                    className={`w-1 h-1 rounded-full ${agent.status === "online" ? "bg-green-500" : "bg-gray-400"}`}
                  ></span>
                  {agent.status.toUpperCase()}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(agent)}
                    className="p-1.5 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(agent.id, agent.name)}
                    disabled={agent.isOwner || agent.id === currentUser?.id}
                    className={`p-1.5 rounded-lg ${agent.isOwner ? "text-gray-300 bg-reply-bg" : "text-red-600 bg-red-50 dark:bg-red-900/20"}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Metrics Grid for Mobile */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-50 dark:border-reply-border-dark">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold">
                  Carga
                </p>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                  {agent.currentLoad} / {agent.maxCapacity}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold">
                  Resueltos
                </p>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
                  {agent.performance.resolved}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold">
                  Tiempo Online
                </p>
                <p className="text-xs font-bold text-indigo-600">
                  <LiveTimer
                    initialSeconds={agent.totalOnlineSeconds || 0}
                    isActive={agent.status === "online"}
                  />
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold">
                  CSAT Prom
                </p>
                <p className="text-xs font-bold text-yellow-500">
                  {agent.performance.csat.toFixed(1)} ⭐
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- HELPER: Live Timer Component ---
const LiveTimer: React.FC<{
  initialSeconds: number;
  isActive: boolean;
}> = ({ initialSeconds, isActive }) => {
  const [seconds, setSeconds] = React.useState(initialSeconds);

  React.useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  return <span className="font-mono tabular-nums">{formatTime(seconds)}</span>;
};

/**
 * TEAM TABLE ROW COMPONENT
 * Individual row in the team table
 */
interface TeamTableRowProps {
  agent: TeamAgent;
  currentUser?: any;
  onEdit: (agent: TeamAgent) => void;
  onDelete: (id: string, name: string) => void;
}

const TeamTableRow: React.FC<TeamTableRowProps> = ({
  agent,
  currentUser,
  onEdit,
  onDelete,
}) => {
  return (
    <tr className="hover:bg-reply-bg dark:hover:bg-[#2a3942] transition-colors group">
      {/* Agent Column */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-4">
          <img
            src={
              agent.avatar ||
              `https://ui-avatars.com/api/?name=${agent.name}&background=random`
            }
            alt=""
            className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600"
          />
          <div>
            <div className="flex items-center gap-2">
              <div className="font-bold text-gray-900 dark:text-white text-sm">
                {agent.isOwner && "👑 "}
                {agent.name}
              </div>
              {agent.role === "Admin" ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 uppercase tracking-wide">
                  ADMIN
                </span>
              ) : agent.role === "Supervisor" ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 uppercase tracking-wide">
                  SUP
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 uppercase tracking-wide">
                  AGENT
                </span>
              )}
              {agent.isAI && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 uppercase tracking-wide flex items-center gap-1">
                  🤖 IA
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {agent.email}
            </div>
          </div>
        </div>
      </td>

      {/* Status Column */}
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold w-fit ${
              agent.status === "online"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : agent.status === "busy"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : agent.status === "away"
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                agent.status === "online"
                  ? "bg-green-500"
                  : agent.status === "busy"
                    ? "bg-red-500"
                    : agent.status === "away"
                      ? "bg-yellow-500"
                      : "bg-gray-400"
              }`}
            ></div>
            <span className="capitalize">{agent.status}</span>
          </div>
          <span className="text-[10px] text-gray-400 mt-1 pl-1 font-mono">
            {agent.statusDuration}
          </span>
        </div>
      </td>

      {/* Workload Column */}
      <td className="px-6 py-4">
        <div className="w-32">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-gray-600 dark:text-gray-400">
              {agent.maxCapacity === 0
                ? "Sin Asignación"
                : `${agent.currentLoad} / ${agent.maxCapacity} Tickets`}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                agent.maxCapacity === 0 ||
                agent.currentLoad >= agent.maxCapacity
                  ? "bg-red-500"
                  : "bg-indigo-500"
              }`}
              style={{
                width: `${
                  agent.maxCapacity === 0
                    ? 100
                    : (agent.currentLoad / agent.maxCapacity) * 100
                }%`,
              }}
            ></div>
          </div>
        </div>
      </td>

      {/* Performance Column */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-sm font-bold text-gray-900 dark:text-white">
              {agent.performance.resolved}
            </div>
            <div className="text-[10px] text-gray-500 uppercase">Resueltos</div>
          </div>
          <div className="h-8 w-px bg-gray-200 dark:bg-gray-700"></div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1">
              {agent.performance.csat.toFixed(1)}{" "}
              <span className="text-yellow-400 text-xs">⭐</span>
            </div>
            <div className="text-[10px] text-gray-500 uppercase">CSAT</div>
          </div>
        </div>
      </td>

      {/* Connected At */}
      <td className="px-6 py-4">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {agent.lastConnectedAt
            ? new Date(agent.lastConnectedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-"}
        </div>
      </td>

      {/* Total Online Time (Live) */}
      <td className="px-6 py-4">
        <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
          <LiveTimer
            initialSeconds={agent.totalOnlineSeconds || 0}
            isActive={agent.status === "online"}
          />
        </div>
      </td>

      {/* Speed Column */}
      <td className="px-6 py-4">
        <div
          className={`text-sm font-bold ${
            agent.speed.frt > 10
              ? "text-red-500"
              : "text-gray-900 dark:text-white"
          }`}
        >
          {agent.speed.frt} min
        </div>
        <div className="text-[10px] text-gray-500">1er Respuesta</div>
      </td>

      {/* Actions Column */}
      <td className="px-6 py-4 text-right">
        {!agent.isAI && (
          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(agent)}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
              title="Editar"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </button>
            <button
              onClick={() => onDelete(agent.id, agent.name)}
              disabled={agent.isOwner || agent.id === currentUser?.id}
              className={`p-2 rounded-lg transition-colors ${
                agent.isOwner || agent.id === currentUser?.id
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
              }`}
              title={
                agent.isOwner ? "No se puede eliminar al Dueño" : "Eliminar"
              }
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
        {agent.isAI && (
          <div className="text-xs text-gray-400 italic">Gestionado por IA</div>
        )}
      </td>
    </tr>
  );
};


