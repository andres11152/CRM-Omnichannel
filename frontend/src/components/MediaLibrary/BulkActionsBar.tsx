import React from "react";

interface BulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onCancel: () => void;
}

export const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeleteSelected,
  onCancel,
}) => {
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[40] animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="bg-gray-900/90 backdrop-blur-xl border border-gray-700 rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-6">
        <div className="flex items-center gap-3 border-r border-gray-700 pr-6">
          <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm">
            {selectedCount}
          </div>
          <span className="text-white font-medium text-sm">Archivos seleccionados</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onSelectAll}
            className="px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            {selectedCount === totalCount ? "Desmarcar todos" : "Seleccionar todos"}
          </button>

          <button
            onClick={onDeleteSelected}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-500/40 transition-all hover:scale-105"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Eliminar seleccionados
          </button>

          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-white rounded-lg" title="Cancelar selección">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
