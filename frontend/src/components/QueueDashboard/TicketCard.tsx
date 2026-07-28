import React from "react";
import { useTranslation } from "react-i18next";

export interface IncomingTicket {
  id: string;
  channel: "whatsapp" | "email" | "web" | "instagram";
  clientName: string;
  waitTime: number; // minutes
  priority: "high" | "medium" | "low";
  department: string;
}

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case "whatsapp":
      return (
        <span className="text-green-500">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
        </span>
      );
    case "email":
      return (
        <span className="text-blue-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </span>
      );
    case "instagram":
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="url(#queue-ig-grad)">
          <defs>
            <linearGradient id="queue-ig-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop stopColor="#833AB4" offset="0%" />
              <stop stopColor="#FD1D1D" offset="50%" />
              <stop stopColor="#FCB045" offset="100%" />
            </linearGradient>
          </defs>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.163 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      );
    default:
      return (
        <span className="text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
            />
          </svg>
        </span>
      );
  }
};

const getPriorityColor = (p: string) => {
  switch (p) {
    case "high":
      return "border-l-red-500";
    case "medium":
      return "border-l-orange-500";
    case "low":
      return "border-l-green-500";
    default:
      return "border-l-gray-300";
  }
};

export const TicketCard = ({ ticket }: { ticket: IncomingTicket }) => {
  const { t } = useTranslation();
  const isOverdue = ticket.waitTime > 15;
  const isCritical = ticket.waitTime > 30;

  return (
    <div
      className={`bg-white dark:bg-reply-panel-dark p-3 rounded-lg border border-gray-200 dark:border-reply-border-dark shadow-sm hover:shadow-md transition-all cursor-move group border-l-4 ${getPriorityColor(ticket.priority)}`}
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.setData("ticketId", ticket.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-reply-bg dark:bg-reply-surface-dark rounded-md">
            {getChannelIcon(ticket.channel)}
          </div>
          <div>
            <span className="block font-bold text-sm text-gray-800 dark:text-white leading-tight">
              {ticket.clientName}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">
              {ticket.channel}
            </span>
          </div>
        </div>
        {isOverdue && (
          <span
            className={`flex h-2 w-2 rounded-full ${isCritical ? "bg-red-500 animate-ping" : "bg-orange-500"}`}
          ></span>
        )}
      </div>

      <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-50 dark:border-reply-border-dark/50">
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
          {ticket.department}
        </span>
        <span
          className={`text-[10px] font-mono font-medium ${isCritical ? "text-red-600 dark:text-red-400" : isOverdue ? "text-orange-600 dark:text-orange-400" : "text-gray-500"}`}
        >
          {t("queue_dashboard.ticket_card.wait_time", "{{min}} min espera", { min: ticket.waitTime })}
        </span>
      </div>
    </div>
  );
};
