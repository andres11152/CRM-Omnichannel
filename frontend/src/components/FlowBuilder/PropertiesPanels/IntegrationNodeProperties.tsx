import React from "react";
import { NodePropertiesProps } from "./MediaNodeProperties";

export const IntegrationNodeProperties: React.FC<NodePropertiesProps> = ({ node, onUpdate }) => {
  if (node.type === "http_request") {
    return (
      <>
        <div className="bg-slate-50 dark:bg-slate-900/20 p-3 rounded-lg border border-slate-200 dark:border-slate-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-300">
              HTTP Request (Webhook)
            </p>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-400">
            Envía o recibe datos desde una API externa
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Método
            </label>
            <select
              value={node.data.method || "POST"}
              onChange={(e) => onUpdate("method", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-slate-500 outline-none"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              URL (Endpoint)
            </label>
            <input
              type="text"
              placeholder="https://api.ejemplo.com/v1/data"
              value={node.data.url || node.data.webhookUrl || ""}
              onChange={(e) => onUpdate("url", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-slate-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Headers (JSON)
            </label>
            <textarea
              rows={3}
              placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
              value={node.data.headers || ""}
              onChange={(e) => onUpdate("headers", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-slate-500 outline-none"
            />
          </div>
          {node.data.method !== "GET" && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Body (JSON)
              </label>
              <textarea
                rows={4}
                placeholder='{"email": "{{email}}", "name": "{{name}}"}'
                value={node.data.body || ""}
                onChange={(e) => onUpdate("body", e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-slate-500 outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Guardar Respuesta en Variable (Opcional)
            </label>
            <input
              type="text"
              placeholder="api_response"
              value={node.data.variable || ""}
              onChange={(e) => onUpdate("variable", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-slate-500 outline-none"
            />
          </div>
        </div>
      </>
    );
  }

  if (node.type === "tag_contact") {
    return (
      <>
        <div className="bg-lime-50 dark:bg-lime-900/20 p-3 rounded-lg border border-lime-200 dark:border-lime-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-lime-900 dark:text-lime-300">
              Etiquetar Contacto
            </p>
          </div>
          <p className="text-xs text-lime-700 dark:text-lime-400">
            Agrega o remueve etiquetas del contacto en el CRM
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Acción
            </label>
            <select
              value={node.data.action || "add"}
              onChange={(e) => onUpdate("action", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-lime-500 outline-none"
            >
              <option value="add">Agregar Etiqueta</option>
              <option value="remove">Remover Etiqueta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Etiquetas (Separadas por comas)
            </label>
            <input
              type="text"
              placeholder="vip, prospecto, ventas"
              value={node.data.tags || node.data.tag || ""}
              onChange={(e) => onUpdate("tags", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-lime-500 outline-none"
            />
          </div>
        </div>
      </>
    );
  }

  if (node.type === "send_template") {
    return (
      <>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
              Enviar Plantilla
            </p>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Envía una plantilla aprobada de WhatsApp (HSM)
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Nombre de la Plantilla
            </label>
            <input
              type="text"
              placeholder="ej: confirmacion_cita"
              value={node.data.templateName || ""}
              onChange={(e) => onUpdate("templateName", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Variables (JSON Array Opcional)
            </label>
            <textarea
              rows={3}
              placeholder='["{{nombre}}", "{{fecha}}", "{{hora}}"]'
              value={node.data.templateVariables || ""}
              onChange={(e) => onUpdate("templateVariables", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>
      </>
    );
  }

  if (node.type === "ai_handoff") {
    return (
      <>
        <div className="bg-rose-50 dark:bg-rose-900/20 p-3 rounded-lg border border-rose-200 dark:border-rose-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-rose-900 dark:text-rose-300">
              AI Handoff (Transferir a Humano)
            </p>
          </div>
          <p className="text-xs text-rose-700 dark:text-rose-400">
            Detiene el bot de IA y marca la conversación para atención humana
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Mensaje de Transición (Opcional)
            </label>
            <textarea
              rows={3}
              placeholder="Un momento, te transferimos con un humano..."
              value={node.data.message || ""}
              onChange={(e) => onUpdate("message", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>
        </div>
      </>
    );
  }

  return null;
};
