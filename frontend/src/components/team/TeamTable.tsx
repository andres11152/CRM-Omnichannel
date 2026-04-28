import React from "react";
import { type TeamAgent } from "./types";
import { 
  Edit, 
  Trash2, 
  UserPlus, 
  Bot, 
  Shield, 
  User, 
  Mail, 
  Clock, 
  Star, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface TeamTableProps {
  agents: TeamAgent[];
  loading: boolean;
  currentUser?: { id: string; role: string } | null;
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
      <div className="flex flex-col justify-center items-center h-64 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Cargando equipo...</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-24 bg-white dark:bg-reply-panel-dark rounded-3xl border-2 border-dashed border-gray-200 dark:border-reply-border-dark flex flex-col items-center">
        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6">
          <UserPlus size={40} />
        </div>
        <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
          Tu equipo está vacío
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
          Comienza a agregar agentes para gestionar tus conversaciones de manera eficiente y profesional.
        </p>
        <button
          onClick={onCreateNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all active:scale-95"
        >
          Agregar Miembro
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 🖥️ DESKTOP TABLE VIEW */}
      <div className="hidden lg:block bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-100 dark:border-reply-border-dark shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#FBFCFE] dark:bg-reply-surface-dark border-b border-gray-100 dark:border-reply-border-dark">
            <tr>
              <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Agente</th>
              <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Estado</th>
              <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Capacidad</th>
              <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Rendimiento</th>
              <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Actividad</th>
              <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
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
      <div className="lg:hidden space-y-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="bg-white dark:bg-reply-panel-dark p-6 rounded-2xl border border-gray-100 dark:border-reply-border-dark shadow-sm space-y-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img
                    src={agent.avatar || `https://ui-avatars.com/api/?name=${agent.name}&background=6366F1&color=fff`}
                    alt=""
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-indigo-50 dark:ring-indigo-900/20"
                  />
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-reply-panel-dark ${agent.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 dark:text-white flex items-center gap-2">
                    {agent.name}
                    {agent.isAI && <Bot size={14} className="text-indigo-500" />}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    {agent.role === "Admin" ? (
                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 uppercase tracking-widest">ADMIN</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-gray-500/10 text-gray-500 dark:text-gray-400 uppercase tracking-widest">AGENT</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(agent)}
                  className="p-2.5 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl"
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={() => onDelete(agent.id, agent.name)}
                  disabled={agent.isOwner || agent.id === currentUser?.id}
                  className={`p-2.5 rounded-xl ${agent.isOwner ? "text-gray-200 bg-gray-50" : "text-rose-600 bg-rose-50 dark:bg-rose-900/20"}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-reply-border-dark">
              <div>
                <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Workload</p>
                <p className="text-sm font-black text-gray-900 dark:text-white">
                  {agent.currentLoad} / {agent.maxCapacity}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Time Online</p>
                <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                  <LiveTimer
                    initialSeconds={agent.totalOnlineSeconds || 0}
                    isActive={agent.status === "online"}
                  />
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

    const pad = (n: number) => n.toString().padStart(2, "0");

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${pad(minutes)}:${pad(secs)}`;
  };

  return <span className="font-mono tabular-nums tracking-tighter">{formatTime(seconds)}</span>;
};

/**
 * TEAM TABLE ROW COMPONENT
 * Individual row in the team table
 */
interface TeamTableRowProps {
  agent: TeamAgent;
  currentUser?: { id: string; role: string } | null;
  onEdit: (agent: TeamAgent) => void;
  onDelete: (id: string, name: string) => void;
}

const TeamTableRow: React.FC<TeamTableRowProps> = ({
  agent,
  currentUser,
  onEdit,
  onDelete,
}) => {
  const statusConfig = {
    online: { color: "emerald", label: "Online" },
    busy: { color: "rose", label: "Ocupado" },
    away: { color: "amber", label: "Ausente" },
    offline: { color: "gray", label: "Offline" },
  };

  const config = statusConfig[agent.status as keyof typeof statusConfig] || statusConfig.offline;

  return (
    <tr className="hover:bg-blue-50/30 dark:hover:bg-indigo-500/5 transition-all group">
      {/* Agent Column */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="relative group/avatar">
            <img
              src={agent.avatar || `https://ui-avatars.com/api/?name=${agent.name}&background=6366F1&color=fff`}
              alt=""
              className="w-12 h-12 rounded-2xl object-cover border-2 border-gray-50 dark:border-gray-700 shadow-sm transition-transform group-hover/avatar:scale-110"
            />
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-reply-panel-dark ${agent.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black text-gray-900 dark:text-white text-sm tracking-tight">{agent.name}</span>
              {agent.isAI ? (
                <span className="px-2 py-0.5 rounded-lg text-[8px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1 border border-indigo-200/50 dark:border-indigo-500/20">
                  <Bot size={10} /> IA
                </span>
              ) : agent.role === "Admin" ? (
                <span className="px-2 py-0.5 rounded-lg text-[8px] font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 uppercase tracking-widest flex items-center gap-1 border border-purple-200/50 dark:border-purple-500/20">
                  <Shield size={10} /> Admin
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-lg text-[8px] font-black bg-gray-500/10 text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-1 border border-gray-200/50 dark:border-gray-500/20">
                  <User size={10} /> Agent
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold tracking-tight">
              <Mail size={10} /> {agent.email}
            </div>
          </div>
        </div>
      </td>

      {/* Status Column */}
      <td className="px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-fit border transition-colors ${
            agent.status === "online" ? "bg-emerald-500/10 text-emerald-600 border-emerald-200/50 dark:border-emerald-500/20" :
            agent.status === "busy" ? "bg-rose-500/10 text-rose-600 border-rose-200/50 dark:border-rose-500/20" :
            agent.status === "away" ? "bg-amber-500/10 text-amber-600 border-amber-200/50 dark:border-amber-500/20" :
            "bg-gray-500/10 text-gray-500 border-gray-200/50 dark:border-gray-500/20"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              agent.status === "online" ? "bg-emerald-500" :
              agent.status === "busy" ? "bg-rose-500" :
              agent.status === "away" ? "bg-amber-500" :
              "bg-gray-400"
            }`} />
            {config.label}
          </div>
          <span className="text-[9px] text-gray-400 pl-1 font-mono tracking-tighter italic">
            {agent.statusDuration}
          </span>
        </div>
      </td>

      {/* Workload Column */}
      <td className="px-6 py-4">
        <div className="w-40">
          <div className="flex justify-between items-end mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Carga Actual
            </span>
            <span className="text-xs font-black text-gray-900 dark:text-white tabular-nums">
              {agent.currentLoad} / {agent.maxCapacity}
            </span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex gap-0.5">
            {[...Array(agent.maxCapacity)].map((_, i) => (
              <div 
                key={i}
                className={`flex-1 h-full rounded-full transition-all duration-500 ${
                  i < agent.currentLoad 
                    ? (agent.currentLoad >= agent.maxCapacity ? 'bg-rose-500' : 'bg-indigo-500')
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      </td>

      {/* Performance Column */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Resueltos</span>
            <span className="text-sm font-black text-gray-900 dark:text-white tabular-nums flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-500" /> {agent.performance.resolved}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">CSAT</span>
            <span className="text-sm font-black text-amber-500 tabular-nums flex items-center gap-1">
              <Star size={12} className="fill-current" /> {agent.performance.csat.toFixed(1)}
            </span>
          </div>
        </div>
      </td>

      {/* Activity Column */}
      <td className="px-6 py-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-indigo-500" />
            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
              <LiveTimer
                initialSeconds={agent.totalOnlineSeconds || 0}
                isActive={agent.status === "online"}
              />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle size={12} className="text-rose-500" />
            <span className={`text-[10px] font-black uppercase tracking-tighter ${agent.speed.frt > 10 ? 'text-rose-500' : 'text-gray-400'}`}>
              FRT: {agent.speed.frt} min
            </span>
          </div>
        </div>
      </td>

      {/* Actions Column */}
      <td className="px-6 py-4 text-right">
        {!agent.isAI && (
          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
            <button
              onClick={() => onEdit(agent)}
              className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all"
              title="Editar"
            >
              <Edit size={18} />
            </button>
            <button
              onClick={() => onDelete(agent.id, agent.name)}
              disabled={agent.isOwner || agent.id === currentUser?.id}
              className={`p-2.5 rounded-xl transition-all ${
                agent.isOwner || agent.id === currentUser?.id
                  ? "text-gray-200 cursor-not-allowed"
                  : "text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
              }`}
              title={agent.isOwner ? "No se puede eliminar al Dueño" : "Eliminar"}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
        {agent.isAI && (
          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest italic opacity-50">SaaS Managed</div>
        )}
      </td>
    </tr>
  );
};
