import React from "react";
import { useTranslation } from "react-i18next";
import { Contact } from "@/types";
import { User, Loader2, Trash2, Layers } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { ChannelBadge } from "./ChannelBadge";

export const GroupRow: React.FC<{
  contact: Contact;
  isActive: boolean;
  isDeleting: boolean;
  deletingId: string | null;
  viewMode: "compact" | "comfortable";
  userRole?: string;
  onSelectContact: (id: string) => void;
  onDelete?: (e: React.MouseEvent, contactId: string) => void;
}> = ({
  contact,
  isActive,
  isDeleting,
  deletingId,
  viewMode,
  userRole,
  onSelectContact,
  onDelete,
}) => {
  const { t } = useTranslation();

  return (
    <div
      onClick={() => !isDeleting && onSelectContact(contact.id)}
      className={`flex items-start gap-2.5 cursor-pointer transition-all relative group border-b border-gray-100 dark:border-reply-border-dark dark:hover:bg-reply-panel-dark hover:bg-reply-bg
      ${viewMode === "compact" ? "py-1.5 px-2" : "py-2 px-3"}
      ${isActive ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-l-4 border-l-emerald-500" : "bg-white dark:bg-reply-surface-dark border-l-4 border-l-transparent"}
      ${isDeleting ? "opacity-50 pointer-events-none" : ""}
    `}
    >
      {/* Delete Button */}
      {(userRole === "ADMIN" || userRole === "company_admin") && onDelete && (
        <button
          onClick={(e) => onDelete(e, contact.id)}
          disabled={!!deletingId}
          className="absolute bottom-0 left-0 p-1.5 opacity-0 group-hover:opacity-100 transition-all text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-transparent dark:hover:bg-transparent z-20"
          title={t("contact_list.delete_ticket", "Eliminar ticket")}
        >
          {isDeleting ? (
            <Loader2 className="animate-spin h-3 w-3 text-red-500" />
          ) : (
            <Trash2 className="w-3 w-3" />
          )}
        </button>
      )}

      {/* Avatar with Group Badge */}
      <div className="relative flex-shrink-0">
        <Avatar
          src={contact.profilePicUrl || contact.avatarUrl || null}
          name={(contact.name || "").replace(/^\[GROUP\]\s*/i, "")}
          className={`${viewMode === "compact" ? "w-8 h-8 text-xs" : "w-10 h-10 text-xs"} shadow-sm ring-1 ring-emerald-200/50 dark:ring-emerald-700/30`}
        />
        <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full border-2 border-white dark:border-reply-border-dark p-0.5" title={t("contact_list.group", "Grupo")}>
          <User className="w-2.5 h-2.5 text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Row 1: Name + Time */}
        <div className="flex justify-between items-center gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {contact.channel && (
              <ChannelBadge
                channel={contact.channel}
                sessionIndex={contact.whatsappSessionIndex}
                sessionPhone={contact.whatsappSessionPhone}
                size="sm"
              />
            )}
            <h3 className={`font-semibold truncate text-gray-900 dark:text-white ${viewMode === "compact" ? "text-xs" : "text-sm"}`}>
              {contact.name.replace(/^\[GROUP\]\s*/i, "")}
            </h3>
            {contact.priority && contact.priority !== "MEDIUM" && (
              <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase shrink-0 ${
                contact.priority === "HIGH" || contact.priority === "URGENT" || contact.priority === "CRITICAL"
                  ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              }`}>
                {contact.priority}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {(contact.unreadCount ?? 0) > 0 && (
              <span className="bg-emerald-500 dark:bg-emerald-600 text-white text-[9px] font-bold px-1.5 min-w-[1rem] h-4 rounded-full flex items-center justify-center shadow-sm">
                {contact.unreadCount}
              </span>
            )}
            <span
              className={`text-[10px] ${(contact.unreadCount ?? 0) > 0 ? "text-emerald-500 dark:text-emerald-400 font-bold" : "text-gray-400 dark:text-gray-500"}`}
            >
              {(() => {
                try {
                  if (!contact.lastMessageTime) return "";
                  const date = new Date(contact.lastMessageTime);
                  return isNaN(date.getTime())
                    ? ""
                    : date.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                } catch {
                  return "";
                }
              })()}
            </span>
          </div>
        </div>

        {/* Row 2: Last Message */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`truncate flex-1 text-gray-500 dark:text-gray-400 ${viewMode === "compact" ? "text-[11px]" : "text-xs"}`}>
            {contact.lastMessage || t("contact_list.no_messages", "Sin mensajes")}
          </span>
        </div>

        {/* Row 3: Agent/Queue (compact inline) */}
        {viewMode !== "compact" &&
          (contact.assignedAgentName || contact.queueName) && (
            <div className="flex items-center gap-1.5 mt-0.5">
              {contact.assignedAgentName && (
                <span
                  className="text-[9px] text-blue-500 dark:text-blue-400 flex items-center gap-0.5"
                  title={t("contact_list.agent", "Agente")}
                >
                  <User className="w-2.5 h-2.5" />
                  {contact.assignedAgentName}
                </span>
              )}
              {contact.queueName && (
                <span
                  className="text-[9px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5"
                  title={t("contact_list.queue", "Cola")}
                >
                  <Layers className="w-2.5 h-2.5" />
                  {contact.queueName}
                </span>
              )}
            </div>
          )}
      </div>
    </div>
  );
};
