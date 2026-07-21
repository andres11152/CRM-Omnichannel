import React from "react";
import { Smile, Reply, Pencil, Trash2, Star, Pin } from "lucide-react";

interface MessageActionsBarProps {
  isAgent: boolean;
  isRevoked: boolean;
  isPinned: boolean;
  isStarred: boolean;
  canStar: boolean;
  canEditOrDelete: boolean;
  hasOnPin: boolean;
  hasOnEdit: boolean;
  hasOnDelete: boolean;
  onPin: () => void;
  onStar: () => void;
  onTogglePicker: () => void;
  onReply: () => void;
  onEditStart: () => void;
  onDeleteRequest: () => void;
}

/**
 * The floating action pill (pin/star/react/reply/edit/delete) that appears
 * above a message bubble on hover — Slack/Telegram pattern, anchored to the
 * message's own side so it never overlaps the bubble text.
 */
export const MessageActionsBar: React.FC<MessageActionsBarProps> = ({
  isAgent,
  isRevoked,
  isPinned,
  isStarred,
  canStar,
  canEditOrDelete,
  hasOnPin,
  hasOnEdit,
  hasOnDelete,
  onPin,
  onStar,
  onTogglePicker,
  onReply,
  onEditStart,
  onDeleteRequest,
}) => {
  return (
    <div
      className={`absolute -top-3.5 ${isAgent ? "right-1" : "left-1"} hidden group-hover/row:flex items-center gap-0.5 z-20 opacity-0 group-hover/row:opacity-100 transition-all duration-150 animate-in fade-in slide-in-from-bottom-1 bg-white dark:bg-[#233138] rounded-full shadow-md border border-gray-100 dark:border-white/10 p-0.5`}
    >
      {hasOnPin && !isRevoked && (
        <button
          onClick={onPin}
          className={`p-1.5 rounded-full transition-colors active:scale-90 ${
            isPinned
              ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/20"
              : "text-gray-400 hover:text-emerald-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-emerald-400 dark:hover:bg-white/10"
          }`}
          title={isPinned ? "Desfijar mensaje" : "Fijar mensaje"}
        >
          <Pin className={`w-3.5 h-3.5 ${isPinned ? "fill-emerald-500" : ""}`} />
        </button>
      )}
      {canStar && (
        <button
          onClick={onStar}
          className={`p-1.5 rounded-full transition-colors active:scale-90 ${
            isStarred
              ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/20"
              : "text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-amber-400 dark:hover:bg-white/10"
          }`}
          title={isStarred ? "Quitar destacado" : "Destacar mensaje"}
        >
          <Star className={`w-3.5 h-3.5 ${isStarred ? "fill-amber-500" : ""}`} />
        </button>
      )}
      <button
        onClick={onTogglePicker}
        className="p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-white/10 transition-colors active:scale-90"
        title="Reaccionar"
      >
        <Smile className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onReply}
        className="p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-white/10 transition-colors active:scale-90"
        title="Responder"
      >
        <Reply className="w-3.5 h-3.5" />
      </button>
      {canEditOrDelete && hasOnEdit && (
        <button
          onClick={onEditStart}
          className="p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-white/10 transition-colors active:scale-90"
          title="Editar mensaje"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {canEditOrDelete && hasOnDelete && (
        <button
          onClick={onDeleteRequest}
          className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-500/20 transition-colors active:scale-90"
          title="Eliminar para todos"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
