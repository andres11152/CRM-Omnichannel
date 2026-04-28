import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  DollarSign,
  Ticket,
  MessageCircle,
  Calendar,
  X,
  Clock,
  TrendingUp,
  Activity,
  ArrowRight,
} from "lucide-react";
import { API_BASE_URL } from "@/services/apiConfig";
import { Contact } from "@/types";

interface TimelineEvent {
  type: "DEAL" | "ACTIVITY" | "TICKET" | "CONVERSATION";
  id: string;
  date: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

interface TimelineResponse {
  status: string;
  data: {
    contact: Contact;
    timeline: TimelineEvent[];
  };
}

interface Props {
  contactId: string;
  onClose: () => void;
}

// ──────────────────────────────────────────────
// TYPE CONFIGS
// ──────────────────────────────────────────────

const TYPE_CONFIG: Record<
  TimelineEvent["type"],
  {
    label: string;
    Icon: React.FC<{ className?: string }>;
    gradient: string;
    badgeBg: string;
    badgeText: string;
    dotColor: string;
  }
> = {
  CONVERSATION: {
    label: "Chat",
    Icon: MessageCircle,
    gradient: "from-sky-500 to-blue-600",
    badgeBg: "bg-sky-100 dark:bg-sky-900/30",
    badgeText: "text-sky-700 dark:text-sky-300",
    dotColor: "bg-sky-500",
  },
  DEAL: {
    label: "Oportunidad",
    Icon: DollarSign,
    gradient: "from-emerald-500 to-green-600",
    badgeBg: "bg-emerald-100 dark:bg-emerald-900/30",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    dotColor: "bg-emerald-500",
  },
  TICKET: {
    label: "Ticket",
    Icon: Ticket,
    gradient: "from-rose-500 to-red-600",
    badgeBg: "bg-rose-100 dark:bg-rose-900/30",
    badgeText: "text-rose-700 dark:text-rose-300",
    dotColor: "bg-rose-500",
  },
  ACTIVITY: {
    label: "Actividad",
    Icon: Calendar,
    gradient: "from-amber-500 to-orange-600",
    badgeBg: "bg-amber-100 dark:bg-amber-900/30",
    badgeText: "text-amber-700 dark:text-amber-300",
    dotColor: "bg-amber-500",
  },
};

// ──────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────

export const ContactTimelineView: React.FC<Props> = ({
  contactId,
  onClose,
}) => {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 250); // Wait for exit animation
  }, [onClose]);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${API_BASE_URL}/contacts/${contactId}/timeline`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.ok) {
          const response = (await res.json()) as TimelineResponse;
          setTimeline(response.data?.timeline || []);
          setContact(response.data?.contact);
        }
      } catch (error) {
        console.error("Error loading timeline", error);
      } finally {
        setLoading(false);
      }
    };

    if (contactId) {
      fetchTimeline();
    }
  }, [contactId]);

  // ESC key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleClose]);

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    };
    return new Date(dateString).toLocaleDateString("es-ES", options);
  };

  const formatRelativeDate = (dateString: string): string => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Ahora mismo";
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return formatDate(dateString);
  };

  // ──────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────
  const stats = {
    total: timeline.length,
    conversations: timeline.filter((e) => e.type === "CONVERSATION").length,
    deals: timeline.filter((e) => e.type === "DEAL").length,
    tickets: timeline.filter((e) => e.type === "TICKET").length,
    activities: timeline.filter((e) => e.type === "ACTIVITY").length,
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[4000] flex justify-end transition-colors duration-250 ${
        isVisible ? "bg-black/40 backdrop-blur-[2px]" : "bg-transparent"
      }`}
      onClick={handleClose}
    >
      {/* Slide Panel */}
      <div
        className={`w-full max-w-md h-full flex flex-col shadow-2xl
          bg-white dark:bg-[#111b21]
          transform transition-transform duration-300 ease-out
          ${isVisible ? "translate-x-0" : "translate-x-full"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── HEADER ─── */}
        <div className="relative overflow-hidden">
          {/* Gradient accent bar */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 opacity-10 dark:opacity-20" />

          <div className="relative px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
                  Línea de Tiempo
                </h2>
                {contact && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {contact.name}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors group"
              title="Cerrar (ESC)"
            >
              <X className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white transition-colors" />
            </button>
          </div>

          {/* Separator */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
        </div>

        {/* ─── STATS ROW ─── */}
        {!loading && timeline.length > 0 && (
          <div className="px-6 py-3 flex gap-2 overflow-x-auto scrollbar-none">
            {[
              { label: "Total", value: stats.total, icon: Activity, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
              { label: "Chats", value: stats.conversations, icon: MessageCircle, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-900/20" },
              { label: "Deals", value: stats.deals, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
              { label: "Tickets", value: stats.tickets, icon: Ticket, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/20" },
            ]
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${s.bg} flex-shrink-0`}
                >
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  <span className={`text-xs font-bold ${s.color}`}>
                    {s.value}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {s.label}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* ─── TIMELINE ─── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
          {loading ? (
            <div className="flex flex-col gap-6 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : timeline?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">
                Sin actividad
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[200px]">
                Aún no hay interacciones registradas con este contacto.
              </p>
            </div>
          ) : (
            <div className="relative ml-5">
              {/* Timeline Spine */}
              <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-indigo-300 via-gray-200 to-transparent dark:from-indigo-700 dark:via-gray-700 dark:to-transparent" />

              <div className="space-y-1">
                {timeline.map((event, index) => {
                  const config = TYPE_CONFIG[event.type];
                  const { Icon } = config;
                  const isFirst = index === 0;

                  return (
                    <div
                      key={`${event.type}-${event.id}`}
                      className={`relative pl-8 py-3 group transition-all duration-200
                        ${isFirst ? "opacity-100" : "opacity-90 hover:opacity-100"}`}
                      style={{
                        animationDelay: `${index * 60}ms`,
                        animation: "fadeInUp 0.4s ease-out forwards",
                      }}
                    >
                      {/* Dot */}
                      <div
                        className={`absolute -left-[5px] top-5 w-[11px] h-[11px] rounded-full border-2 border-white dark:border-[#111b21] shadow-sm ${config.dotColor}
                          ${isFirst ? "ring-4 ring-offset-1 ring-offset-white dark:ring-offset-[#111b21]" : ""}
                          ${isFirst ? "ring-indigo-100 dark:ring-indigo-900/40" : ""}`}
                      />

                      {/* Card */}
                      <div
                        className={`rounded-xl p-3.5 border transition-all duration-200 cursor-default
                          bg-white dark:bg-[#1a2730]
                          border-gray-100 dark:border-gray-700/50
                          hover:border-gray-200 dark:hover:border-gray-600
                          hover:shadow-md dark:hover:shadow-black/20
                          ${isFirst ? "shadow-sm border-indigo-100 dark:border-indigo-800/50" : ""}`}
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}
                            >
                              <Icon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${config.badgeBg} ${config.badgeText}`}
                            >
                              {config.label}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap font-medium">
                            {formatRelativeDate(event.date)}
                          </span>
                        </div>

                        {/* Title & Subtitle */}
                        <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-100 leading-snug">
                          {event.title}
                        </h4>
                        {event.subtitle && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                            {event.subtitle}
                          </p>
                        )}

                        {/* Hover indicator */}
                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">
                            Ver detalle
                          </span>
                          <ArrowRight className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ─── FOOTER ─── */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700/50">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
            {timeline.length > 0
              ? `${timeline.length} evento${timeline.length !== 1 ? "s" : ""} registrado${timeline.length !== 1 ? "s" : ""}`
              : "Historial de interacciones del contacto"}
          </p>
        </div>
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
};
