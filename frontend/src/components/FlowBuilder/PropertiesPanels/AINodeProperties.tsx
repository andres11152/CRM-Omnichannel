import React from "react";
import { FlowNode } from "@/types";
import { Bot, Handshake } from "lucide-react";

interface AINodePropertiesProps {
  node: FlowNode;
  onUpdate: (key: string, value: unknown) => void;
  aiAgents: Array<{
    id: string;
    name: string;
    modelName?: string;
    model?: string;
    description?: string;
  }>;
  loadingAgents: boolean;
}

export const AINodeProperties: React.FC<AINodePropertiesProps> = ({
  node,
  onUpdate,
  aiAgents,
  loadingAgents,
}) => {
  return (
    <>
      {node.type === "ai_agent" && (
        <>
          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <p className="text-xs font-bold text-cyan-900 dark:text-cyan-300">
                Agente IA Inteligente
              </p>
            </div>
            <p className="text-xs text-cyan-700 dark:text-cyan-400">
              Selecciona un agente existente de "IA & Conocimiento" o crea uno
              nuevo.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
               Seleccionar Agente IA
            </label>

            {loadingAgents ? (
              <div className="w-full p-3 bg-reply-bg dark:bg-gray-800 rounded-lg text-center">
                <div className="animate-spin inline-block w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
                <p className="text-xs text-gray-500 mt-2">
                  Cargando agentes...
                </p>
              </div>
            ) : (
              <>
                <select
                  value={node.data.aiAssistantId || ""}
                  onChange={(e) => onUpdate("aiAssistantId", e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  <option value="">Seleccionar Agente...</option>
                  {aiAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                       {agent.name}
                    </option>
                  ))}
                </select>
                {aiAgents.length === 0 && (
                  <p className="text-[10px] text-red-500 mt-2 italic">
                    No hay agentes disponibles. Crea uno en IA & Conocimiento.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Prompt Adicional (Opcional)
            </label>
            <textarea
              rows={4}
              value={node.data.additionalPrompt || ""}
              onChange={(e) => onUpdate("additionalPrompt", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
              placeholder="Ej: Solo responde con un 'Hola' y no des más información..."
            />
            <p className="text-[10px] text-gray-400 mt-1 italic">
              Se concatena al prompt base del agente
            </p>
          </div>
          
          <div className="mt-4 p-3 bg-cyan-50/50 dark:bg-cyan-900/10 rounded-lg border border-cyan-100 dark:border-cyan-800/30">
             <label className="flex items-center gap-2 cursor-pointer">
               <input 
                 type="checkbox"
                 checked={node.data.waitForUser || false}
                 onChange={(e) => onUpdate("waitForUser", e.target.checked)}
                 className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
               />
               <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Pausar flujo</span>
             </label>
             <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 ml-6 leading-relaxed">
               Si se activa, el bot responderá y <span className="font-bold text-cyan-600">detendrá el flujo</span> esperando que el usuario vuelva a escribir para continuar la conversación con el Agente IA de manera continua.
             </p>
          </div>
        </>
      )}

      {node.type === "ai_handoff" && (
        <>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Handshake className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300">
                Transferencia Inteligente (Handoff)
              </p>
            </div>
            <p className="text-[10px] text-indigo-700 dark:text-indigo-400">
              Usa IA para evaluar la conversación y transferir al departamento correcto.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Instrucciones para la IA
            </label>
            <textarea
              rows={4}
              value={node.data.handoffPrompt || ""}
              onChange={(e) => onUpdate("handoffPrompt", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Ej: Si el cliente está enojado, transfiere a 'Soporte VIP'. Si pregunta por precios, transfiere a 'Ventas'."
            />
          </div>
        </>
      )}
    </>
  );
};
