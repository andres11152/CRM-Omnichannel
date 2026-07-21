import React from "react";
import { useTranslation } from "react-i18next";
import { Contact, Tag } from "@/types";
import { Bot, User, Loader2, Trash2, Pin, BellOff, Layers } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { ChannelBadge } from "./ChannelBadge";

export const ContactRow: React.FC<{
  contact: Contact;
  isActive: boolean;
  isDeleting: boolean;
  deletingId: string | null;
  viewMode: "compact" | "comfortable";
  userRole?: string;
  allTags: Tag[];
  onSelectContact: (id: string) => void;
  onDelete?: (e: React.MouseEvent, contactId: string) => void;
  onTagOverflowHover: (e: React.MouseEvent, tags: string[]) => void;
  onTagOverflowLeave: () => void;
}> = ({
  contact,
  isActive,
  isDeleting,
  deletingId,
  viewMode,
  userRole,
  allTags,
  onSelectContact,
  onDelete,
  onTagOverflowHover,
  onTagOverflowLeave,
}) => {
  const { t } = useTranslation();

  return (
    <div
      onClick={() => !isDeleting && onSelectContact(contact.id)}
      className={`flex items-start gap-2.5 cursor-pointer transition-all relative group border-b border-gray-100 dark:border-reply-border-dark dark:hover:bg-reply-panel-dark hover:bg-reply-bg
      ${viewMode === "compact" ? "py-1.5 px-2" : "py-2 px-3"}
      ${
        isActive
          ? "bg-gray-100 dark:bg-reply-border-dark border-l-4 border-l-green-500"
          : "bg-white dark:bg-reply-surface-dark border-l-4 border-l-transparent"
      }
      ${isDeleting ? "opacity-50 pointer-events-none" : ""}
    `}
    >
      {/* 100-Year UI: Delete Button relocated to ABSOLUTE top-left to maximize space */}
      {(userRole === "ADMIN" || userRole === "company_admin") && onDelete && (
        <button
          onClick={(e) => onDelete(e, contact.id)}
          disabled={!!deletingId}
          className="absolute bottom-0 left-0 p-1.5 opacity-0 group-hover:opacity-100 transition-all text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-transparent dark:hover:bg-transparent z-20"
          title="Eliminar ticket"
        >
          {isDeleting ? (
            <Loader2 className="animate-spin h-3 w-3 text-red-500" />
          ) : (
            <Trash2 className="w-3 w-3" />
          )}
        </button>
      )}

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar
          src={contact.profilePicUrl || contact.avatarUrl || null}
          name={(contact.name || "").replace(/^\[GROUP\]\s*/i, "")}
          className={`${viewMode === "compact" ? "w-8 h-8 text-xs" : "w-10 h-10 text-xs"} shadow-sm`}
        />
        {/* Bot Indicator */}
        {contact.assignedMode === "bot" && (
          <div
            className={`absolute -bottom-1 -right-1 bg-blue-500 dark:bg-blue-600 rounded-full border-2 border-white dark:border-reply-border-dark ${viewMode === "compact" ? "p-0.5" : "p-0.5"}`}
            title={t("contact_list.handled_by_bot", "Atendido por Bot")}
          >
            <Bot
              className={`${viewMode === "compact" ? "w-2 h-2" : "w-3 h-3"} text-white`}
            />
          </div>
        )}
        {contact.isGroup && (
          <div
            className="absolute -top-1 -right-1 bg-orange-500 rounded-full border-2 border-white dark:border-reply-border-dark p-0.5"
            title={t("contact_list.group", "Grupo")}
          >
            <User className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Row 1: Name + Time */}
        <div className="flex justify-between items-center gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* [APP] Channel Badge (WhatsApp #1, #2, etc.) */}
            {contact.channel && (
              <ChannelBadge
                channel={contact.channel}
                sessionIndex={contact.whatsappSessionIndex}
                sessionPhone={contact.whatsappSessionPhone}
                size="sm"
              />
            )}
            <h3
              className={`font-semibold truncate text-gray-900 dark:text-white ${viewMode === "compact" ? "text-xs" : "text-sm"}`}
            >
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
            {contact.mutedUntil && (
              <BellOff
                className="w-3 h-3 text-gray-400 dark:text-gray-500"
                aria-label={t("contact_list.muted", "Silenciado")}
              />
            )}
            {contact.isPinned && (
              <Pin
                className="w-3 h-3 text-gray-500 dark:text-gray-400 fill-current"
                aria-label={t("contact_list.pinned", "Fijado")}
              />
            )}
            {(contact.unreadCount ?? 0) > 0 && (
              <span className="bg-green-500 dark:bg-green-600 text-white text-[9px] font-bold px-1.5 min-w-[1rem] h-4 rounded-full flex items-center justify-center shadow-sm">
                {contact.unreadCount}
              </span>
            )}
            <span
              className={`text-[10px] ${(contact.unreadCount ?? 0) > 0 ? "text-green-500 dark:text-green-400 font-bold" : "text-gray-400 dark:text-gray-500"}`}
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

        {/* Row 2: Message + Tags (inline) */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`truncate flex-1 text-gray-500 dark:text-gray-400 ${viewMode === "compact" ? "text-[11px]" : "text-xs"}`}
          >
            {contact.lastMessage}
          </span>
          {/* Inline Tags */}
          {viewMode !== "compact" &&
            (contact.tags?.length || 0) > 0 && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {(() => {
                  const tags = contact.tags || [];
                  const MAX_VISIBLE = 2;
                  const visibleTagIds = tags.slice(0, MAX_VISIBLE);
                  const hiddenCount = tags.length - MAX_VISIBLE;

                  return (
                    <>
                      {visibleTagIds.map((tagId) => {
                        const tag = allTags.find((t) => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <span
                            key={tagId}
                            className={`text-[8px] px-1 py-0.5 rounded font-bold truncate max-w-[50px] ${tag.color}`}
                            title={tag.name}
                          >
                            {tag.name}
                          </span>
                        );
                      })}
                      {hiddenCount > 0 && (
                        <span
                          className="text-[8px] px-1 py-0.5 rounded font-bold bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          onMouseEnter={(e) => onTagOverflowHover(e, tags.slice(MAX_VISIBLE))}
                          onMouseLeave={onTagOverflowLeave}
                        >
                          +{hiddenCount}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
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
