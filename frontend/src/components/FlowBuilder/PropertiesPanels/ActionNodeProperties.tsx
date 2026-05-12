import React from "react";
import { NodePropertiesProps } from "./MediaNodeProperties";

export const ActionNodeProperties: React.FC<NodePropertiesProps> = ({ node, onUpdate }) => {
  if (node.type === "action_email") {
    return (
      <>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Destinatario
          </label>
          <input
            type="text"
            placeholder="ej: cliente@email.com o {{email}}"
            value={node.data.options?.[0] || ""}
            onChange={(e) => onUpdate("options", [e.target.value, node.data.options?.[1] || ""])}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Asunto
          </label>
          <input
            type="text"
            placeholder="Asunto del correo"
            value={node.data.options?.[1] || ""}
            onChange={(e) => onUpdate("options", [node.data.options?.[0] || "", e.target.value])}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Cuerpo del Correo
          </label>
          <textarea
            rows={4}
            value={node.data.content || ""}
            onChange={(e) => onUpdate("content", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Hola {{nombre}}, ..."
          />
        </div>
      </>
    );
  }

  if (node.type === "action_calendar") {
    return (
      <>
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-red-800 dark:text-red-300">
              Integración Google Calendar
            </p>
          </div>
          <p className="text-xs text-red-600 dark:text-red-300">
            Este nodo enviará opciones de horario disponibles o un link de
            agendamiento al usuario.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Título del Evento
          </label>
          <input
            type="text"
            placeholder="ej: Demo de Producto"
            value={node.data.label || ""}
            onChange={(e) => onUpdate("label", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
          />
        </div>

        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Duración (minutos)
          </label>
          <select
            value={node.data.options?.[0] || "30"}
            onChange={(e) => onUpdate("options", [e.target.value, node.data.options?.[1] || ""])}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
          >
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">60 min (1 hr)</option>
          </select>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Link de Calendario (Opcional)
          </label>
          <input
            type="text"
            placeholder="https://calendar.google.com/..."
            value={node.data.options?.[1] || ""}
            onChange={(e) => onUpdate("options", [node.data.options?.[0] || "30", e.target.value])}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Si se deja vacío, se usar la integración nativa de Google Calendar.
          </p>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Mensaje de Éxito
          </label>
          <textarea
            rows={2}
            value={node.data.content || "¡Listo! Tu cita ha sido agendada para {{fecha}}."}
            onChange={(e) => onUpdate("content", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
          />
        </div>
      </>
    );
  }

  if (node.type === "action_task") {
    return (
      <>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Título de la Tarea
          </label>
          <input
            type="text"
            placeholder="ej: Llamar al cliente"
            value={node.data.label || ""}
            onChange={(e) => onUpdate("label", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Descripción
          </label>
          <textarea
            rows={3}
            value={node.data.content || ""}
            onChange={(e) => onUpdate("content", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Detalles de la tarea..."
          />
        </div>
      </>
    );
  }

  return null;
};
