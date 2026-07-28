import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Reply, Pencil, Trash2, Star, Pin } from "lucide-react";

interface MessageActionsDropdownProps {
  isAgent: boolean;
  isRevoked: boolean;
  isPinned: boolean;
  isStarred: boolean;
  canStar: boolean;
  canEditOrDelete: boolean;
  hasOnPin: boolean;
  hasOnEdit: boolean;
  hasOnDelete: boolean;
  isOpen: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onPin: () => void;
  onStar: () => void;
  onReply: () => void;
  onEditStart: () => void;
  onDeleteRequest: () => void;
}

export const MessageActionsDropdown: React.FC<MessageActionsDropdownProps> = ({
  isAgent,
  isRevoked,
  isPinned,
  isStarred,
  canStar,
  canEditOrDelete,
  hasOnPin,
  hasOnEdit,
  hasOnDelete,
  isOpen,
  buttonRef,
  onClose,
  onPin,
  onStar,
  onReply,
  onEditStart,
  onDeleteRequest,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        (!buttonRef?.current || !buttonRef.current.contains(target))
      ) {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    if (isOpen) {
      window.addEventListener("mousedown", handleClickOutside, true);
      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside, true);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, onClose, buttonRef]);

  if (!isOpen) return null;

  const rect = buttonRef?.current?.getBoundingClientRect();
  const windowWidth = typeof window !== "undefined" ? window.innerWidth : 360;
  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 640;

  const menuHeight = 220;
  const opensUpward = rect ? rect.bottom + menuHeight > windowHeight - 16 : false;

  const top = rect
    ? opensUpward
      ? Math.max(12, rect.top - menuHeight - 6)
      : Math.min(rect.bottom + 4, windowHeight - menuHeight - 12)
    : 0;

  let left: number | undefined;
  let right: number | undefined;

  if (rect) {
    if (isAgent) {
      left = Math.max(12, Math.min(rect.left, windowWidth - 180));
    } else {
      right = Math.max(12, Math.min(windowWidth - rect.right, windowWidth - 180));
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: `${top}px`,
        ...(left !== undefined ? { left: `${left}px` } : {}),
        ...(right !== undefined ? { right: `${right}px` } : {}),
        zIndex: 9999,
      }}
      className="min-w-[170px] bg-white dark:bg-[#233138] rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/15 py-1.5 animate-in fade-in zoom-in-95 duration-150 text-xs font-medium text-gray-700 dark:text-gray-200"
    >
      <button
        onClick={() => {
          onReply();
          onClose();
        }}
        className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
      >
        <Reply className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span>{t("chat.actions.reply", "Responder")}</span>
      </button>

      {canStar && (
        <button
          onClick={() => {
            onStar();
            onClose();
          }}
          className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
        >
          <Star className={`w-4 h-4 ${isStarred ? "text-amber-500 fill-amber-500" : "text-gray-500 dark:text-gray-400"}`} />
          <span>{isStarred ? t("chat.actions.unstar", "Quitar destacado") : t("chat.actions.star", "Destacar mensaje")}</span>
        </button>
      )}

      {hasOnPin && !isRevoked && (
        <button
          onClick={() => {
            onPin();
            onClose();
          }}
          className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
        >
          <Pin className={`w-4 h-4 ${isPinned ? "text-emerald-500 fill-emerald-500" : "text-gray-500 dark:text-gray-400"}`} />
          <span>{isPinned ? t("chat.actions.unpin", "Desfijar mensaje") : t("chat.actions.pin", "Fijar mensaje")}</span>
        </button>
      )}

      {canEditOrDelete && hasOnEdit && (
        <button
          onClick={() => {
            onEditStart();
            onClose();
          }}
          className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
        >
          <Pencil className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span>{t("chat.actions.edit", "Editar mensaje")}</span>
        </button>
      )}

      {canEditOrDelete && hasOnDelete && (
        <>
          <div className="my-1 border-t border-gray-100 dark:border-white/10" />
          <button
            onClick={() => {
              onDeleteRequest();
              onClose();
            }}
            className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-red-50 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors text-left font-semibold"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t("chat.actions.delete", "Eliminar para todos")}</span>
          </button>
        </>
      )}
    </div>,
    document.body
  );
};
