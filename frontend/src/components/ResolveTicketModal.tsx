import React, { useState } from "react";
import {
  X,
  CheckCircle2,
  LifeBuoy,
  ShieldAlert,
  Archive,
  Ban,
  Briefcase,
  DollarSign,
  MessageSquare,
} from "lucide-react";
import { ResolutionType } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onResolve: (category: ResolutionType | string, reason: string) => void;
  isResolving?: boolean;
}

export const ResolveTicketModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onResolve,
  isResolving = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!isOpen) return null;

  const categories = [
    {
      id: "SALE",
      label: "Venta Cerrada",
      description: "Transacción completada exitosamente",
      icon: DollarSign,
      colorClass: "text-emerald-600 dark:text-emerald-400",
      bgClass: "bg-emerald-50 dark:bg-emerald-900/20",
      borderClass: "border-emerald-200 dark:border-emerald-800",
      hoverClass: "hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
    },
    {
      id: "SUPPORT",
      label: "Soporte Resuelto",
      description: "Incidencia técnica o duda solucionada",
      icon: LifeBuoy,
      colorClass: "text-blue-600 dark:text-blue-400",
      bgClass: "bg-blue-50 dark:bg-blue-900/20",
      borderClass: "border-blue-200 dark:border-blue-800",
      hoverClass: "hover:bg-blue-100 dark:hover:bg-blue-900/40",
    },
    {
      id: "ADMIN",
      label: "Administrativo",
      description: "Gestión interna o procesos",
      icon: Briefcase,
      colorClass: "text-purple-600 dark:text-purple-400",
      bgClass: "bg-purple-50 dark:bg-purple-900/20",
      borderClass: "border-purple-200 dark:border-purple-800",
      hoverClass: "hover:bg-purple-100 dark:hover:bg-purple-900/40",
    },
    {
      id: "OTHER",
      label: "Otro / Archivo",
      description: "Consulta general sin categoría específica",
      icon: Archive,
      colorClass: "text-gray-600 dark:text-gray-400",
      bgClass: "bg-reply-bg dark:bg-gray-800",
      borderClass: "border-gray-200 dark:border-reply-border-dark",
      hoverClass: "hover:bg-gray-100 dark:hover:bg-gray-700",
    },
  ];

  const handleSubmit = () => {
    if (selectedCategory) {
      onResolve(selectedCategory, note);
    }
  };

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      {/* [SEC] ENTERPRISE: Max height constraints and flex column layout for scrolling content */}
      <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-reply-border-dark">
        {/* 1. Header (Sticky) */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-white dark:bg-reply-panel-dark flex-shrink-0 z-10">
          <div className="flex items-center gap-2">
            <div className="bg-green-100 dark:bg-green-900/20 p-1.5 rounded-full">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                Finalizar Ticket
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Selecciona el resultado de la gestión
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Content (Scrollable) */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative">
          <div className="grid grid-cols-1 gap-3 mb-6">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  disabled={isResolving}
                  className={`relative group flex items-start gap-4 p-4 rounded-xl border transition-all text-left w-full
                                        ${
                                          isSelected
                                            ? `ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#1f2937] ${cat.borderClass} ${cat.bgClass} shadow-md`
                                            : `border-gray-200 dark:border-reply-border-dark hover:border-gray-300 dark:hover:border-gray-600 hover:bg-reply-bg dark:hover:bg-gray-800/50`
                                        }
                                    `}
                >
                  <div
                    className={`p-2.5 rounded-lg ${isSelected ? "bg-white/50 dark:bg-black/20" : cat.bgClass} ${cat.colorClass} transition-colors`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-bold text-sm mb-0.5 ${isSelected ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-200"}`}
                    >
                      {cat.label}
                    </div>
                    <div
                      className={`text-xs leading-tight ${isSelected ? "text-gray-600 dark:text-gray-300" : "text-gray-500 dark:text-gray-400"}`}
                    >
                      {cat.description}
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      className={`absolute top-4 right-4 animate-in fade-in zoom-in duration-200`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full ${cat.colorClass.replace("text-", "bg-")} flex items-center justify-center`}
                      >
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Closing Note Section - Always rendered but expanded when needed */}
          <div
            className={`transform transition-all duration-300 ease-in-out ${selectedCategory ? "opacity-100 translate-y-0" : "opacity-50 grayscale pointer-events-none"}`}
          >
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              <MessageSquare className="w-3 h-3" />
              Nota de Cierre (Opcional)
            </label>
            <div className="relative">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  selectedCategory
                    ? "Describe los detalles de la resolución..."
                    : "Selecciona una categoría primero..."
                }
                disabled={!selectedCategory || isResolving}
                className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-gray-800/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px] resize-none transition-all placeholder:text-gray-400"
              />
              {/* Character count or helper could go here */}
            </div>
          </div>
        </div>

        {/* 3. Footer (Sticky) */}
        <div className="p-4 border-t border-gray-100 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark flex-shrink-0 flex gap-3 z-10">
          <button
            onClick={() => onResolve("SPAM", "Ticket marcado como Spam")}
            className="px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30 font-bold text-sm flex items-center justify-center gap-2 transition-colors hover:shadow-sm"
            title="Marcar como Spam y Bloquear"
          >
            <Ban className="w-4 h-4" />
            <span className="hidden sm:inline">Spam</span>
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedCategory || isResolving}
            className={`flex-1 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95
                            ${
                              !selectedCategory || isResolving
                                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed shadow-none"
                                : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-500/30 hover:shadow-blue-500/40"
                            }
                        `}
          >
            {isResolving ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Resolución
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


