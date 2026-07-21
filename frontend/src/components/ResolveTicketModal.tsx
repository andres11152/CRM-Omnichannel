import React, { useState } from "react";
import {
  CheckCircle2,
  LifeBuoy,
  Archive,
  Ban,
  Briefcase,
  DollarSign,
  MessageSquare,
} from "lucide-react";
import { ResolutionType } from "@/types";
import { Modal, ModalButton } from "@/components/ui/Modal";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Finalizar Ticket"
      subtitle="Selecciona el resultado de la gestión"
      icon={<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
      size="md"
      busy={isResolving}
      footer={
        <>
          <ModalButton
            variant="secondary"
            onClick={() => onResolve("SPAM", "Ticket marcado como Spam")}
            disabled={isResolving}
            className="!text-red-600 dark:!text-red-400 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <Ban className="w-4 h-4" />
            <span className="hidden sm:inline">Spam</span>
          </ModalButton>
          <ModalButton
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedCategory}
            loading={isResolving}
            className="flex-1"
          >
            {!isResolving && <CheckCircle2 className="w-4 h-4" />}
            {isResolving ? "Procesando..." : "Confirmar Resolución"}
          </ModalButton>
        </>
      }
    >
      <div>
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
                                            ? `ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 ${cat.borderClass} ${cat.bgClass} shadow-md`
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
    </Modal>
  );
};


