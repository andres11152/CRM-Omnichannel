import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Archive, ArchiveRestore, Pin, PinOff, BellOff, Bell } from "lucide-react";
import { Contact } from "@/types";
import { getPriorityColor } from "./helpers";

interface ActionMenuProps {
  contact: Contact;
  isTightMode: boolean;
  currentPriority: "LOW" | "MEDIUM" | "HIGH";
  onChangePriority?: (priority: "LOW" | "MEDIUM" | "HIGH") => void;
  onResolve: () => void;
  onTransfer: () => void;
  onToggleParticipantsPanel?: () => void;
  onToggleCustomer360?: () => void;
  onEmail?: () => void;
  onCopyChat: () => void;
  onSyncHistory?: () => void;
  onEditContact: () => void;
  onTogglePinned?: () => void;
  onToggleMuted?: () => void;
  onToggleArchived?: () => void;
  onToggleBlockContact?: () => void;
}

/**
 * "More actions" dropdown — carries mobile-only shortcuts (resolve, transfer,
 * participants, customer 360) that don't fit the toolbar on small screens,
 * plus the always-available secondary actions (email, copy, sync, edit,
 * pin/mute/archive/block) and, in ultra-compact "tight mode", the priority
 * selector as well.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({
  contact,
  isTightMode,
  currentPriority,
  onChangePriority,
  onResolve,
  onTransfer,
  onToggleParticipantsPanel,
  onToggleCustomer360,
  onEmail,
  onCopyChat,
  onSyncHistory,
  onEditContact,
  onTogglePinned,
  onToggleMuted,
  onToggleArchived,
  onToggleBlockContact,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const menuItems = [
    // [APP] MOBILE ONLY ACTIONS (Moved from toolbar to clear space)
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      label: t("chat.resolve_ticket", "Resolver Ticket"),
      onClick: onResolve,
      visible: true,
      className: "md:hidden font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10",
      iconClassName: "text-green-600 dark:text-green-400",
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      label: t("chat.transfer", "Transferir"),
      onClick: onTransfer,
      visible: !!onTransfer,
      className: "md:hidden",
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
      label: t("chat.participants", "Participantes"),
      onClick: onToggleParticipantsPanel,
      visible: !!onToggleParticipantsPanel,
      className: "md:hidden",
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
          />
        </svg>
      ),
      label: t("chat.customer_360", "Info. Cliente (360)"),
      onClick: onToggleCustomer360,
      visible: !!onToggleCustomer360 && !onToggleParticipantsPanel,
      className: "md:hidden",
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
      label: t("chat.send_email", "Enviar Email"),
      onClick: onEmail,
      visible: !!onEmail,
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
          />
        </svg>
      ),
      label: t("chat.copy_history", "Copiar Historial"),
      onClick: onCopyChat,
      visible: true,
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      ),
      label: t("chat.sync_history", "Sincronizar Historial"),
      onClick: onSyncHistory,
      visible: !!onSyncHistory,
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      ),
      label: t("chat.edit_contact", "Editar Contacto"),
      onClick: onEditContact,
      visible: true,
    },
    {
      icon: contact.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />,
      label: contact.isPinned ? t("chat.unpin_chat", "Desfijar Chat") : t("chat.pin_chat", "Fijar Chat"),
      onClick: onTogglePinned,
      visible: !!onTogglePinned,
    },
    {
      icon: contact.mutedUntil ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />,
      label: contact.mutedUntil ? t("chat.unmute_chat", "Reactivar Notificaciones") : t("chat.mute_chat", "Silenciar Chat"),
      onClick: onToggleMuted,
      visible: !!onToggleMuted,
    },
    {
      icon: contact.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />,
      label: contact.isArchived ? t("chat.unarchive_chat", "Desarchivar Chat") : t("chat.archive_chat", "Archivar Chat"),
      onClick: onToggleArchived,
      visible: !!onToggleArchived,
    },
    {
      icon: <Ban className="w-4 h-4" />,
      label: contact.isBlocked ? t("chat.unblock_contact", "Desbloquear Contacto") : t("chat.block_contact", "Bloquear Contacto"),
      onClick: onToggleBlockContact,
      visible: !!onToggleBlockContact && !contact.isGroup,
      className: contact.isBlocked ? "" : "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-md transition-all h-9 w-9 flex items-center justify-center border ${isOpen ? "bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white" : "text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-reply-border-dark hover:border-gray-300 dark:hover:border-gray-500 shadow-sm"}`}
        title={t("chat.more_actions", "Más Acciones")}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-reply-panel-dark rounded-xl shadow-xl border border-gray-100 dark:border-reply-border-dark overflow-hidden z-[100]">
          <div className="py-1">
            {menuItems
              .filter((i) => i.visible)
              .map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-800 flex items-center gap-3 transition-colors ${item.className || ""}`}
                >
                  <span className={`text-gray-400 dark:text-gray-500 group-hover:text-blue-500 ${item.iconClassName || ""}`}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
          </div>

          {/* Priority Selector Inside Dropdown for Ultra-Compact Mode */}
          {isTightMode && (
            <div className="border-t border-gray-100 dark:border-reply-border-dark p-2 bg-reply-bg dark:bg-gray-800/50">
              <div className="text-[10px] font-bold text-gray-400 mb-1 px-2 uppercase">{t("chat.priority", "Prioridad")}</div>
              <div className="flex gap-1">
                {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => onChangePriority?.(p)}
                    className={`flex-1 py-1 rounded text-[10px] font-bold border ${
                      currentPriority === p ? getPriorityColor(p) : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500"
                    }`}
                  >
                    {p.charAt(0)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
