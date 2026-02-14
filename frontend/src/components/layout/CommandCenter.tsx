import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Command,
  MessageSquare,
  Users,
  Bot,
  Settings,
  X,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export const CommandCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  // 快捷键支持 (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!isOpen) return null;

  const quickActions = [
    {
      id: "chat",
      title: "Nueva Conversación",
      icon: <MessageSquare size={18} />,
      path: "/workspace",
      color: "text-blue-500",
    },
    {
      id: "contacts",
      title: "Gestionar Contactos",
      icon: <Users size={18} />,
      path: "/contacts",
      color: "text-purple-500",
    },
    {
      id: "flows",
      title: "Constructor de Chatbots",
      icon: <Bot size={18} />,
      path: "/chatbot/flujos",
      color: "text-teal-500",
    },
    {
      id: "settings",
      title: "Configuración CRM",
      icon: <Settings size={18} />,
      path: "/settings",
      color: "text-gray-500",
    },
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsOpen(false);
    setSearch("");
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-start justify-center pt-[15vh] p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal Container */}
      <div className="bg-white dark:bg-reply-panel-dark w-full max-w-2xl rounded-[2rem] shadow-2xl border border-reply-border dark:border-reply-border-dark overflow-hidden relative z-10 animate-in slide-in-from-top-4 duration-300">
        {/* Search Header */}
        <div className="p-6 border-b border-reply-border dark:border-reply-border-dark flex items-center gap-4">
          <Search className="text-gray-400 dark:text-gray-500" size={24} />
          <input
            type="text"
            placeholder="¿Qué estás buscando? (Acciones, clientes, flujos...)"
            className="flex-1 bg-transparent border-none outline-none text-xl font-medium text-reply-text-primary dark:text-reply-text-primary-dark placeholder-gray-400 dark:placeholder-gray-600"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex items-center gap-2 px-3 py-1 bg-reply-bg dark:bg-reply-surface-dark border border-reply-border dark:border-reply-border-dark rounded-lg">
            <Command size={12} className="text-gray-400" />
            <span className="text-[10px] font-black text-gray-400">K</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-reply-bg dark:hover:bg-reply-surface-dark rounded-full transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
          {search.length === 0 ? (
            <div className="space-y-6 p-4">
              <div>
                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 px-2">
                  Acciones Rápidas
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleNavigate(action.path)}
                      className="flex items-center gap-4 p-4 rounded-2xl hover:bg-reply-bg dark:hover:bg-reply-surface-dark transition-all group border border-transparent hover:border-reply-border dark:hover:border-reply-border-dark"
                    >
                      <div
                        className={`p-2 rounded-xl bg-reply-bg dark:bg-reply-surface-dark group-hover:bg-white dark:group-hover:bg-reply-panel-dark shadow-sm transition-colors ${action.color}`}
                      >
                        {action.icon}
                      </div>
                      <span className="font-bold text-reply-text-primary dark:text-reply-text-primary-dark">
                        {action.title}
                      </span>
                      <ChevronRight
                        size={14}
                        className="ml-auto text-gray-300 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-reply-bg dark:bg-reply-surface-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search size={32} className="text-gray-300" />
              </div>
              <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark font-medium">
                No hay resultados para "{search}"
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Intenta buscar algo más general o utiliza las acciones rápidas.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-reply-bg/50 dark:bg-reply-bg-dark/50 border-t border-reply-border dark:border-reply-border-dark flex items-center gap-6 justify-center">
          <div className="flex items-center gap-2">
            <div className="px-1.5 py-0.5 bg-white dark:bg-reply-panel-dark border border-reply-border dark:border-reply-border-dark rounded text-[10px] font-bold text-gray-500 shadow-sm">
              ESC
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
              Cerrar
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-1.5 py-0.5 bg-white dark:bg-reply-panel-dark border border-reply-border dark:border-reply-border-dark rounded text-[10px] font-bold text-gray-500 shadow-sm">
              ENTER
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
              Seleccionar
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
