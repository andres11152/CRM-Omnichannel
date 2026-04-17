import React from "react";
import {
  Inbox,
  Clock,
  MessageSquare,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Zap,
} from "lucide-react";
import { Ticket } from "@/types";
import { Avatar } from "@/components/common/Avatar";
import { BASE_URL } from "@/services/apiConfig";

interface QueuePreviewCardProps {
  ticket: Ticket;
  isRestricted: boolean;
  onPickTicket: () => void;
}

export const QueuePreviewCard: React.FC<QueuePreviewCardProps> = ({
  ticket,
  isRestricted,
  onPickTicket,
}) => {
  return (
    <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-[#0b141a] dark:via-[#111b21] dark:to-[#0b141a]">
      <div className="max-w-md w-full space-y-4">
        {/* Card */}
        <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-xl border border-gray-200/80 dark:border-reply-border-dark overflow-hidden">
          {/* Top Accent Bar */}
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />

          {/* Contact Header */}
          <div className="px-6 pt-5 pb-4 flex items-start gap-4">
            <div className="relative flex-shrink-0">
              <Avatar
                src={
                  (ticket.contact.profilePicUrl?.startsWith("/")
                    ? `${BASE_URL}${ticket.contact.profilePicUrl}`
                    : ticket.contact.profilePicUrl) ||
                  ticket.contact.avatarUrl ||
                  null
                }
                name={ticket.contact.name || "Usuario"}
                className="w-14 h-14 shadow-md ring-2 ring-white dark:ring-gray-700"
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full border-2 border-white dark:border-reply-panel-dark flex items-center justify-center">
                <Clock className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {ticket.contact.name || "Sin Nombre"}
              </h3>
              {ticket.contact.phone && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                  {ticket.contact.phone.startsWith("+")
                    ? ticket.contact.phone
                    : `+${ticket.contact.phone}`}
                </p>
              )}
              <div className="flex items-center flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200/60 dark:border-green-800/40">
                  <MessageCircle className="w-3 h-3" />
                  {ticket.channel?.toUpperCase() || "WHATSAPP"}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                  <Inbox className="w-3 h-3" />
                  EN COLA
                </span>
                {ticket.priority && (
                  <PriorityBadge priority={ticket.priority} />
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-6 border-t border-gray-100 dark:border-reply-border-dark" />

          {/* Last Message Section */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-2.5">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Último mensaje
              </span>
              <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                {formatDate(ticket.lastMessageAt)}
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-[#111b21] rounded-xl p-3.5 border border-gray-100 dark:border-gray-700/50">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
                {ticket.lastMessage || "Sin mensaje previo..."}
              </p>
            </div>
          </div>

          {/* Context Metadata */}
          <div className="px-6 pb-4 grid grid-cols-2 gap-2.5">
            <div className="bg-gray-50 dark:bg-[#111b21] rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/50">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                Ticket
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-white mt-0.5">
                {ticket.ticketNumber !== undefined &&
                ticket.ticketNumber !== null
                  ? `#${ticket.ticketNumber}`
                  : "—"}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-[#111b21] rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/50">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                Espera
              </p>
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {formatWaitTime(ticket.createdAt)}
              </p>
            </div>
            {ticket.queue?.name && (
              <div className="bg-gray-50 dark:bg-[#111b21] rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/50 col-span-2">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  Cola
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-white mt-0.5">
                  {ticket.queue.name}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTA Button */}
        {isRestricted ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3.5 rounded-xl text-sm font-semibold text-center border border-red-200 dark:border-red-800 flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Acción no disponible en modo restringido
          </div>
        ) : (
          <button
            onClick={onPickTicket}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-green-500/20 transform transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-green-500/30 active:scale-[0.98] flex items-center justify-center gap-2.5 group"
          >
            <CheckCircle2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            <span className="text-base tracking-wide">Tomar Ticket</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ── Helpers ──

function PriorityBadge({ priority }: { priority: string }) {
  const styles =
    priority === "CRITICAL" || priority === "HIGH"
      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200/60 dark:border-red-800/40"
      : priority === "MEDIUM"
        ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200/60 dark:border-yellow-800/40"
        : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/40";

  const label =
    priority === "CRITICAL"
      ? "Crítico"
      : priority === "HIGH"
        ? "Alta"
        : priority === "MEDIUM"
          ? "Media"
          : "Baja";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles}`}
    >
      <Zap className="w-3 h-3" />
      {label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("es-CO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatWaitTime(createdAt: string): string {
  const mins = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 60000,
  );
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ${mins % 60}m` : `${Math.floor(hrs / 24)}d`;
}
