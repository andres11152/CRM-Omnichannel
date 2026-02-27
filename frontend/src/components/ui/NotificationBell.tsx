import React, { useState } from "react";
import { Bell, BellOff, Check, Trash2, MessageCircle } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: "chat" | "system" | "deal";
}

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      title: "Nuevo Mensaje",
      message: "Andrés Felipe te ha enviado un mensaje en el ticket #1052",
      time: "Hace 2 min",
      read: false,
      type: "chat",
    },
    {
      id: "2",
      title: "Oportunidad Ganada",
      message: 'El deal "Implementación CRM" ha sido marcado como Ganado.',
      time: "Hace 1 hora",
      read: false,
      type: "deal",
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 bg-reply-bg dark:bg-reply-surface-dark rounded-xl border border-reply-border dark:border-reply-border-dark group transition-all hover:scale-110 active:scale-95 shadow-sm"
      >
        <Bell
          className={`w-5 h-5 transition-colors ${unreadCount > 0 ? "text-reply-brand animate-swing" : "text-gray-400 group-hover:text-reply-text-primary"}`}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-4 ring-white dark:ring-reply-panel-dark animate-in zoom-in">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed left-4 right-4 top-20 md:absolute md:inset-auto md:right-0 md:mt-4 md:w-96 bg-white dark:bg-reply-panel-dark rounded-[2rem] shadow-2xl border border-reply-border dark:border-reply-border-dark z-50 overflow-hidden animate-in slide-in-from-top-2 zoom-in-95 duration-200 origin-top-right">
            {/* Header */}
            <div className="px-6 py-5 bg-reply-bg/50 dark:bg-reply-bg-dark/50 border-b border-reply-border dark:border-reply-border-dark flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-reply-text-primary dark:text-reply-text-primary-dark tracking-tight">
                  Notificaciones
                </h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-black rounded-md uppercase">
                    Nuevas
                  </span>
                )}
              </div>
              <button
                onClick={clearAll}
                className="text-[10px] font-black text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors"
              >
                Limpiar todo
              </button>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-reply-bg dark:bg-reply-surface-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <BellOff size={32} className="text-gray-300" />
                  </div>
                  <p className="text-reply-text-secondary dark:text-reply-text-secondary-dark font-bold">
                    Todo al día
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    No tienes notificaciónes pendientes.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-reply-border dark:divide-reply-border-dark">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-5 flex gap-4 transition-colors relative group hover:bg-reply-bg/30 dark:hover:bg-reply-bg-dark/30 ${!n.read ? "bg-reply-brand/[0.03] dark:bg-reply-brand/[0.01]" : ""}`}
                    >
                      <div
                        className={`mt-1 h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${
                          n.type === "chat"
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-500"
                            : n.type === "deal"
                              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500"
                              : "bg-gray-50 dark:bg-gray-700 text-gray-500"
                        }`}
                      >
                        {n.type === "chat" ? (
                          <MessageCircle size={20} />
                        ) : (
                          <Bell size={20} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4
                            className={`text-sm tracking-tight truncate pr-8 ${!n.read ? "font-black text-reply-text-primary dark:text-reply-text-primary-dark" : "font-bold text-gray-500"}`}
                          >
                            {n.title}
                          </h4>
                        </div>
                        <p className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark leading-relaxed mb-2 line-clamp-2">
                          {n.message}
                        </p>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widestá">
                          {n.time}
                        </span>
                      </div>

                      {/* Actions on hover */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        {!n.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(n.id);
                            }}
                            className="p-1.5 bg-white dark:bg-reply-panel-dark border border-reply-border dark:border-reply-border-dark rounded-lg text-reply-brand hover:bg-reply-brand hover:text-white shadow-sm transition-all"
                            title="Marcar como leída"
                          >
                            <Check size={14} strokeWidth={3} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(n.id);
                          }}
                          className="p-1.5 bg-white dark:bg-reply-panel-dark border border-reply-border dark:border-reply-border-dark rounded-lg text-gray-400 hover:bg-red-500 hover:text-white shadow-sm transition-all"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Unread indicator dot */}
                      {!n.read && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-reply-brand shadow-[0_0_8px_rgba(0,168,132,0.6)]" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-reply-bg/30 dark:bg-reply-bg-dark/30 border-t border-reply-border dark:border-reply-border-dark">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest hover:bg-reply-bg dark:hover:bg-reply-surface-dark rounded-xl transition-colors"
              >
                Ver todas las actividades
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
