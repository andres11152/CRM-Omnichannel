import React, { useState, useEffect } from "react";
import { NodePropertiesProps } from "./MediaNodeProperties";
import { getAgents, getQueues } from "@/services/queueService";

export const RoutingNodeProperties: React.FC<NodePropertiesProps> = ({ node, onUpdate, triggerType }) => {
  const [humanAgents, setHumanAgents] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [supportQueues, setSupportQueues] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingRouting, setLoadingRouting] = useState(false);
  const isCrmWorkflow = triggerType === "EVENT";

  useEffect(() => {
    if (node.type === "assign_agent") {
      fetchRoutingData();
    }
  }, [node.type]);

  const fetchRoutingData = async () => {
    setLoadingRouting(true);
    try {
      // A CRM automation reassigns the deal's owner — there's no support
      // queue concept for a deal, so skip that fetch entirely.
      const [agentsData, queuesData] = await Promise.all([
        getAgents(),
        isCrmWorkflow ? Promise.resolve([]) : getQueues(),
      ]);
      setHumanAgents(agentsData);
      setSupportQueues(queuesData);
    } catch (err) {
      console.error("Failed to fetch routing data", err);
    } finally {
      setLoadingRouting(false);
    }
  };

  if (node.type === "assign_agent" && isCrmWorkflow) {
    return (
      <>
        <div className="bg-pink-50 dark:bg-pink-900/20 p-3 rounded-lg border border-pink-200 dark:border-pink-800 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-pink-900 dark:text-pink-300">
              Reasignar Dueño del Deal
            </p>
          </div>
          <p className="text-xs text-pink-700 dark:text-pink-400">
            Cambia el vendedor responsable de este negocio.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Nuevo Dueño
          </label>
          {loadingRouting ? (
            <div className="text-xs text-gray-400">Cargando agentes...</div>
          ) : (
            <select
              value={node.data.agentId || ""}
              onChange={(e) => onUpdate("agentId", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-pink-500"
            >
              <option value="">-- Seleccionar Vendedor --</option>
              {humanAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} {agent.email ? `(${agent.email})` : ""}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-gray-400 mt-1">
            El deal se reasignará automáticamente a este vendedor.
          </p>
        </div>
      </>
    );
  }

  if (node.type === "assign_agent") {
    return (
      <>
        <div className="bg-pink-50 dark:bg-pink-900/20 p-3 rounded-lg border border-pink-200 dark:border-pink-800 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-pink-900 dark:text-pink-300">
              Enrutamiento Humano
            </p>
          </div>
          <p className="text-xs text-pink-700 dark:text-pink-400">
            Transfiere el chat a un humano o equipo específico.
          </p>
        </div>

        {/*  Routing Mode Selector */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
          <button
            onClick={() => {
              onUpdate("assignmentType", "agent");
              onUpdate("queueId", undefined);
            }}
            className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${
              node.data.assignmentType !== "queue"
                ? "bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-300 shadow-sm"
                : "text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Agente
          </button>
          <button
            onClick={() => {
              onUpdate("assignmentType", "queue");
              onUpdate("agentId", undefined);
            }}
            className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${
              node.data.assignmentType === "queue"
                ? "bg-white dark:bg-gray-600 text-pink-600 dark:text-pink-300 shadow-sm"
                : "text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Cola
          </button>
        </div>

        {/*  AGENT MODE - DROPDOWN */}
        {node.data.assignmentType !== "queue" && (
          <div className="mb-4 animate-fadeIn">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Agente Responsable
            </label>
            {loadingRouting ? (
              <div className="text-xs text-gray-400">Cargando agentes...</div>
            ) : (
              <select
                value={node.data.agentId || ""}
                onChange={(e) => onUpdate("agentId", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-pink-500"
              >
                <option value="">-- Seleccionar Agente --</option>
                {humanAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} {agent.email ? `(${agent.email})` : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400 mt-1">
              El chat se asignar directamente a este usuario.
            </p>
          </div>
        )}

        {/* QUEUE MODE - DROPDOWN */}
        {node.data.assignmentType === "queue" && (
          <div className="mb-4 animate-fadeIn">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Cola de Atención
            </label>
            {loadingRouting ? (
              <div className="text-xs text-gray-400">Cargando colas...</div>
            ) : (
              <select
                value={node.data.queueId || ""}
                onChange={(e) => onUpdate("queueId", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-pink-500"
              >
                <option value="">-- Seleccionar Cola --</option>
                {supportQueues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400 mt-1">
              El chat esperar en esta cola hasta que un agente lo tome.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Mensaje de Transición
          </label>
          <textarea
            rows={2}
            placeholder="Un momento, transfiriendo tu chat..."
            value={node.data.message || ""}
            onChange={(e) => onUpdate("message", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-pink-500 outline-none"
          />
        </div>

        <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex gap-2">
          <span className="text-lg">[WARNING]</span>
          <p className="text-xs text-orange-800 dark:text-orange-300">
            El bot se <strong>detendrá</strong> y el chat pasará a estado{" "}
            {node.data.assignmentType === "queue" ? "PENDIENTE" : "ASIGNADO"}.
          </p>
        </div>
      </>
    );
  }

  return null;
};
