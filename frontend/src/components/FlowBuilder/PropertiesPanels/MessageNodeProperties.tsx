import React from "react";
import { NodePropertiesProps } from "./MediaNodeProperties";

export const MessageNodeProperties: React.FC<NodePropertiesProps> = ({ node, onUpdate }) => {
  if (node.type === "message" || node.type === "send_message") {
    return (
      <>
        {node.type === "send_message" && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-bold text-blue-900 dark:text-blue-300">
                Enviar Mensaje de Texto
              </p>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Contenido del Mensaje
          </label>
          <textarea
            rows={4}
            value={node.data.message || node.data.content || ""}
            onChange={(e) => {
              if (node.type === "message") onUpdate("content", e.target.value);
              else onUpdate("message", e.target.value);
            }}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Escribe el mensaje que se enviará al usuario..."
          />
          <p className="text-xs text-gray-400 mt-1">
            Puedes usar variables como {"{{nombre}}"}.
          </p>
        </div>
      </>
    );
  }

  if (node.type === "input" || node.type === "ask_data") {
    const isAskData = node.type === "ask_data";
    const colorClass = isAskData ? "orange" : "indigo";
    return (
      <>
        {isAskData && (
          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-bold text-orange-900 dark:text-orange-300">
                Solicitar Datos
              </p>
            </div>
            <p className="text-xs text-orange-700 dark:text-orange-400">
              El flujo se PAUSA hasta que el usuario responda
            </p>
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Pregunta al Usuario
          </label>
          <textarea
            rows={2}
            value={node.data.question || node.data.content || ""}
            onChange={(e) => {
              if (isAskData) onUpdate("question", e.target.value);
              else onUpdate("content", e.target.value);
            }}
            className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-${colorClass}-500 outline-none`}
            placeholder="¿Cuál es tu correo?"
          />
        </div>
        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Guardar en Variable
          </label>
          <input
            type="text"
            placeholder="ej: email_cliente"
            value={node.data.variable || node.data.variableName || ""}
            onChange={(e) => {
              if (isAskData) onUpdate("variable", e.target.value);
              else onUpdate("variableName", e.target.value);
            }}
            className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-${colorClass}-500 outline-none`}
          />
          {isAskData && (
            <p className="text-xs text-gray-400 mt-1">
              Luego puedes usar {"{{"}variable{"}}"} en otros mensajes
            </p>
          )}
        </div>
      </>
    );
  }

  return null;
};
