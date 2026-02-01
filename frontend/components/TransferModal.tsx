import React, { useState, useEffect } from "react";
import { Agent, QueueConfig } from "../types";
import { getAgents, getQueues } from "../services/queueService";

// 🏢 100-Year Solution: Extended interface for agents with AI capabilities
interface AgentWithAI extends Agent {
  isAI?: boolean;
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTransfer: (targetId: string, type: "AGENT" | "QUEUE") => void;
  /** 🛡️ 100-Year Fix: Current user ID to exclude from transfer list */
  currentUserId?: string;
}

export const TransferModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onTransfer,
  currentUserId,
}) => {
  const [activeTab, setActiveTab] = useState<"AGENTS" | "QUEUES">("AGENTS");
  const [agents, setAgents] = useState<AgentWithAI[]>([]);
  const [queues, setQueues] = useState<QueueConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([getAgents(), getQueues()])
        .then(([agentsData, queuesData]) => {
          setAgents(agentsData);
          setQueues(queuesData);
        })
        .catch((err) => console.error("Error loading transfer options", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 🛡️ 100-Year Fix: Exclude current user from transfer list
  // An agent cannot transfer a ticket to themselves
  const filteredAgents = agents.filter(
    (a) =>
      a.id !== currentUserId &&
      a.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Show ALL queues including those with AI
  const filteredQueues = queues.filter((q) =>
    q.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleConfirm = () => {
    if (selectedId) {
      onTransfer(selectedId, activeTab === "AGENTS" ? "AGENT" : "QUEUE");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#202c33] w-full max-w-md rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            Transferir Ticket
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "AGENTS" ? "border-reply-green text-reply-green dark:text-reply-green-dark" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}
            onClick={() => {
              setActiveTab("AGENTS");
              setSelectedId(null);
            }}
          >
            Agentes
          </button>
          <button
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "QUEUES" ? "border-reply-green text-reply-green dark:text-reply-green-dark" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}
            onClick={() => {
              setActiveTab("QUEUES");
              setSelectedId(null);
            }}
          >
            Colas / Departamentos
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <input
            type="text"
            placeholder={
              activeTab === "AGENTS" ? "Buscar agente..." : "Buscar cola..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-100 dark:bg-[#111b21] border border-transparent focus:border-reply-green rounded-lg px-4 py-2 text-sm text-gray-800 dark:text-white focus:outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center text-gray-400 py-4">Cargando...</div>
          ) : activeTab === "AGENTS" ? (
            filteredAgents.length === 0 ? (
              <div className="text-center text-gray-400 py-4">
                No se encontraron agentes
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border ${selectedId === agent.id ? "border-reply-green bg-reply-green/10 dark:bg-reply-green-dark/10" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                >
                  <div className="relative">
                    <img
                      src={
                        agent.avatar ||
                        `https://ui-avatars.com/api/?name=${agent.name}`
                      }
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <span
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#202c33] ${["online", "available"].includes(agent.status) ? "bg-green-500" : "bg-gray-400"}`}
                    ></span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm text-gray-800 dark:text-white">
                      {agent.name}
                    </h4>
                    <p className="text-xs text-gray-500">{agent.email}</p>
                  </div>
                  {agent.isAI && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                      🤖 IA
                    </span>
                  )}
                </div>
              ))
            )
          ) : filteredQueues.length === 0 ? (
            <div className="text-center text-gray-400 py-4">
              No se encontraron colas
            </div>
          ) : (
            filteredQueues.map((queue) => (
              <div
                key={queue.id}
                onClick={() => setSelectedId(queue.id)}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border ${selectedId === queue.id ? "border-reply-green bg-reply-green/10 dark:bg-reply-green-dark/10" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}
              >
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
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
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm text-gray-800 dark:text-white">
                    {queue.name}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {queue.departmentDetails?.name || "General"}
                  </p>
                </div>
                {queue.aiAssistantId && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                    🤖 IA
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className="px-6 py-2 bg-reply-green hover:bg-reply-green-dark text-white rounded-lg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Transferir
          </button>
        </div>
      </div>
    </div>
  );
};
