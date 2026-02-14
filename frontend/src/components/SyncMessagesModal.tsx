import React, { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (date: string) => void;
}

export const SyncMessagesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    onSubmit(date);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all animate-in fade-in zoom-in duration-200 border border-gray-100 dark:border-reply-border-dark">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <span className="bg-reply-brand/10 dark:bg-reply-brand/20 p-2 rounded-full text-reply-brand">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </span>
          Sincronizar Historial
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-reply-brand/5 dark:bg-reply-brand/10 p-4 rounded-lg text-sm text-reply-brand dark:text-reply-brand">
            <p>
              Esta herramienta buscará mensajes antiguos en tus chats de
              WhatsApp activos y los importará al CRM.
            </p>
            <p className="mt-2 font-medium">
              Nota: Solo se importarán los últimos 50 mensajes de cada chat que
              sean posteriores a la fecha seleccionada.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fecha de Inicio
            </label>
            <input
              type="date"
              value={date}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-reply-brand focus:border-transparent outline-none transition-all"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Se importarán mensajes desde esta fecha en adelante.
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-reply-brand hover:bg-reply-brand-dark text-white rounded-lg font-bold shadow-sm transition-colors flex items-center gap-2"
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Iniciar Sincronización
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
