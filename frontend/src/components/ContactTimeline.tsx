import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/services/apiConfig";

interface TimelineItem {
  type: "DEAL" | "ACTIVITY" | "TICKET" | "CONVERSATION";
  id: string;
  date: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

interface ContactTimelineProps {
  contactId: string;
}

export default function ContactTimeline({ contactId }: ContactTimelineProps) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [contact, setContact] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  } | null>(null);
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
        const data = await res.json();

        if (data.contact && data.timeline) {
          setContact(data.contact);
          setTimeline(data.timeline);
        }
      } catch (error) {
        console.error("Error fetching timeline:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [contactId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-reply-teal"></div>
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No hay actividad registrada para este contacto
      </div>
    );
  }

  const getColorClasses = (color: string) => {
    switch (color) {
      case "green":
        return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800";
      case "blue":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      case "red":
        return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800";
      case "yellow":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
      default:
        return "bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-reply-border-dark";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return `Hoy a las ${date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
    } else if (days === 1) {
      return "Ayer";
    } else if (days < 7) {
      return `Hace ${days} días`;
    } else {
      return date.toLocaleDateString("es", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      {contact && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {contact.name}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {contact.email || contact.phone || "Sin información de contacto"}
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>

        {/* Timeline items */}
        <div className="space-y-6">
          {timeline.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="relative flex items-start gap-4"
            >
              {/* Icon */}
              <div
                className={`flex-shrink-0 w-12 h-12 rounded-full border-4 border-white dark:border-gray-900 flex items-center justify-center text-xl z-10 ${getColorClasses(item.color)}`}
              >
                {item.icon}
              </div>

              {/* Content */}
              <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-reply-border-dark p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {item.title}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                    {formatDate(item.date)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {item.subtitle}
                </p>

                {/* Type badge */}
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getColorClasses(item.color)}`}
                  >
                    {item.type === "DEAL" && "Oportunidad"}
                    {item.type === "ACTIVITY" && "Actividad"}
                    {item.type === "TICKET" && "Ticket"}
                    {item.type === "CONVERSATION" && "Conversación"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
