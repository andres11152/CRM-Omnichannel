import React from "react";
import { NodePropertiesProps } from "./MediaNodeProperties";

export const SystemNodeProperties: React.FC<NodePropertiesProps> = ({ node, onUpdate }) => {
  if (node.type === "condition") {
    return (
      <>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🔀</span>
            <p className="text-xs font-bold text-yellow-900 dark:text-yellow-300">
              Condición / Ramificación
            </p>
          </div>
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            El flujo toma el camino <span className="text-emerald-600 font-black">SÍ</span> o <span className="text-red-600 font-black">NO</span> según la evaluación
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Variable a Evaluar
          </label>
          <input
            type="text"
            placeholder="nombre_variable"
            value={node.data.conditionVariable || node.data.variable || node.data.variableName || ""}
            onChange={(e) => onUpdate("conditionVariable", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-yellow-500 outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            Ej: respuesta_usuario, email, nombre
          </p>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Tipo de Condición
          </label>
          <select
            value={node.data.conditionOperator || "contains"}
            onChange={(e) => onUpdate("conditionOperator", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-yellow-500 outline-none"
          >
            <option value="equals">Es igual a</option>
            <option value="contains">Contiene</option>
            <option value="greater_than">Mayor que (número)</option>
            <option value="less_than">Menor que (número)</option>
            <option value="exists">Existe (no vacío)</option>
          </select>
        </div>

        {node.data.conditionOperator !== "exists" && (
          <div className="mt-4">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              Valor a Comparar
            </label>
            <input
              type="text"
              placeholder='Ej: "sí", "no", "@gmail.com"'
              value={node.data.conditionValue || ""}
              onChange={(e) => onUpdate("conditionValue", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-yellow-500 outline-none"
            />
          </div>
        )}

        <div className="mt-4 p-3 bg-gradient-to-r from-emerald-50 to-red-50 dark:from-emerald-900/10 dark:to-red-900/10 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="font-black text-emerald-700 dark:text-emerald-400">SÍ</span>
              <span className="text-gray-500">→ Condición verdadera</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="font-black text-red-700 dark:text-red-400">NO</span>
              <span className="text-gray-500">→ Condición falsa</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
            Conecta nodos desde los puertos <span className="font-bold text-emerald-600">verde</span> y <span className="font-bold text-red-600">rojo</span> del nodo de condición en el lienzo.
          </p>
        </div>
      </>
    );
  }

  if (node.type === "delay") {
    return (
      <>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">⏱</span>
            <p className="text-xs font-bold text-orange-900 dark:text-orange-300">
              Delay / Espera
            </p>
          </div>
          <p className="text-xs text-orange-700 dark:text-orange-400">
            Pausa el flujo durante un tiempo específico antes de continuar
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Duración
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="5"
              value={node.data.delayValue || ""}
              onChange={(e) => onUpdate("delayValue", e.target.value)}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none"
            />
            <select
              value={node.data.delayUnit || "minutes"}
              onChange={(e) => onUpdate("delayUnit", e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="seconds">Segundos</option>
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            El flujo continuar automáticamente después del tiempo especificado
          </p>
        </div>
      </>
    );
  }

  if (node.type === "end") {
    return (
      <>
        <div className="bg-reply-bg dark:bg-gray-900/20 p-3 rounded-lg border border-gray-200 dark:border-reply-border-dark mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">[COMPLETE]</span>
            <p className="text-xs font-bold text-gray-900 dark:text-gray-300">
              Fin del Flujo
            </p>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-400">
            Finaliza el flujo de automatización
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Mensaje de Despedida (Opcional)
          </label>
          <textarea
            rows={3}
            placeholder="¡Gracias por tu tiempo! Nos pondremos en contacto pronto."
            value={node.data.message || ""}
            onChange={(e) => onUpdate("message", e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-gray-500 outline-none"
          />
        </div>

        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p className="text-xs text-green-800 dark:text-green-300">
            El flujo se detendrá completamente después de este nodo
          </p>
        </div>
      </>
    );
  }

  return null;
};
