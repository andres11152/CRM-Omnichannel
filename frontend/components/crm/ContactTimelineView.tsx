import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { DollarSign, Ticket, MessageCircle, Calendar } from "lucide-react";
import { API_BASE_URL } from "../../services/apiConfig";
import { Contact } from "../../types";

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

export const ContactTimelineView: React.FC<Props> = ({
  contactId,
  onClose,
}) => {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

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

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    };
    return new Date(dateString).toLocaleDateString("es-ES", options);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[4000] flex justify-end bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#202c33] h-full shadow-2xl flex flex-col animate-slide-in-right transform transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-[#202c33]">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">
              Línea de Tiempo
            </h2>
            {contact && <p className="text-xs text-gray-500">{contact.name}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {loading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
                ></div>
              ))}
            </div>
          ) : timeline?.length === 0 ? (
            <div className="text-center text-gray-400 mt-10">
              <p>No hay actividad registrada.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-3 space-y-8 pb-8">
              {timeline.map((event, index) => (
                <div
                  key={`${event.type}-${event.id}`}
                  className="relative pl-8"
                >
                  {/* Icon */}
                  <div
                    className={`absolute -left-[11px] top-0 w-6 h-6 rounded-full border-2 border-white dark:border-[#202c33] flex items-center justify-center text-xs shadow-sm bg-white dark:bg-[#111b21]
                                        ${event.type === "DEAL" ? "text-green-600 dark:text-green-400" : ""}
                                        ${event.type === "TICKET" ? "text-red-600 dark:text-red-400" : ""}
                                        ${event.type === "CONVERSATION" ? "text-blue-600 dark:text-blue-400" : ""}
                                        ${event.type === "ACTIVITY" ? "text-amber-600 dark:text-amber-400" : ""}
                                    `}
                  >
                    {event.type === "DEAL" && (
                      <DollarSign className="w-3.5 h-3.5" />
                    )}
                    {event.type === "TICKET" && (
                      <Ticket className="w-3.5 h-3.5" />
                    )}
                    {event.type === "CONVERSATION" && (
                      <MessageCircle className="w-3.5 h-3.5" />
                    )}
                    {event.type === "ACTIVITY" && (
                      <Calendar className="w-3.5 h-3.5" />
                    )}
                  </div>
                  {/* Content Card */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                    <div className="flex justify-between items-start mb-1">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                                                 ${event.type === "DEAL" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : ""}
                                                 ${event.type === "TICKET" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : ""}
                                                 ${event.type === "CONVERSATION" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : ""}
                                                 ${event.type === "ACTIVITY" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : ""}
                                            `}
                      >
                        {event.type === "CONVERSATION" && "Chat"}
                        {event.type === "DEAL" && "Oportunidad"}
                        {event.type === "TICKET" && "Ticket"}
                        {event.type === "ACTIVITY" && "Actividad"}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        {formatDate(event.date)}
                      </span>
                    </div>
                    <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                      {event.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {event.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
