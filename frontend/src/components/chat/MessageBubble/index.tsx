import React, { useState } from "react";
import { X, Check, Star, Trash2, EyeOff } from "lucide-react";
import { Message } from "@/types";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { getCurrentUserId, formatTime, getNameColor } from "./helpers";
import { MessageActionsBar } from "./MessageActionsBar";
import { ReactionTriggerButton } from "./ReactionTriggerButton";
import { ReactionPicker } from "./ReactionPicker";
import { MediaContent } from "./MediaContent";
import { MessageText } from "./MessageText";
import { FloatingReactions } from "./FloatingReactions";
import { MessageStatus } from "./MessageStatus";

interface MessageBubbleProps {
  message: Message;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, reaction: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onStar?: (messageId: string, starred: boolean) => void;
  onPin?: (messageId: string, pinned: boolean) => void;
  onQuoteClick?: () => void | null;
  onImageClick?: (mediaUrl: string) => void;
  isGroup?: boolean;
  groupedMessages?: Message[];
}

/**
 * MESSAGE BUBBLE COMPONENT
 * Renders individual message bubble with different styles for agent/customer
 *  Memoized to prevent re-renders during optimistic update reconciliation
 */
const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onStar,
  onPin,
  onQuoteClick,
  onImageClick,
  isGroup,
  groupedMessages,
}) => {
  const isOutbound = message.direction === "OUTBOUND" || message.sender === "agent";
  const isAgent = isOutbound;
  const isSystem = message.sender === "system";
  const isRevoked = message.status === "REVOKED";
  const isEdited = !!(message.metadata as Record<string, unknown> | null)?.isEdited;
  const isStarred = !!(message.metadata as Record<string, unknown> | null)?.starred;
  const isPinned = !!(message.metadata as Record<string, unknown> | null)?.isPinned;
  // Only the agent's own delivered outbound messages can be edited/deleted-for-everyone
  // (WhatsApp/Baileys restriction — mirrored here so the buttons only appear when valid).
  const canEditOrDelete = isAgent && !isSystem && !isRevoked;
  const canStar = !isSystem && !isRevoked && !!onStar;
  const isWhisper = !!(message.metadata as Record<string, unknown> | null)?.isWhisper;
  const [showPicker, setShowPicker] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const sideReactionRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showPicker || showFullPicker) return;

    const handleClickOutside = (e: Event) => {
      if (
        sideReactionRef.current &&
        !sideReactionRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside, true);
    window.addEventListener("touchstart", handleClickOutside, true);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside, true);
      window.removeEventListener("touchstart", handleClickOutside, true);
    };
  }, [showPicker, showFullPicker]);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== message.content && onEdit) {
      onEdit(message.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(message.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Extract actual sender name from possible backend populated relations.
  // Priority for group messages: metadata.senderName (WhatsApp pushName stored at ingest time)
  // → message.senderName (REST API: User DB name) → sender.name (socket: User object)
  const senderNameObj = message.sender;
  const metaSenderName = isGroup && !isAgent
    ? (message.metadata as Record<string, unknown> | null)?.senderName as string | undefined
    : undefined;
  const rawSenderName =
    metaSenderName ||
    (message.senderName && message.senderName !== "+unknown" ? message.senderName : undefined) ||
    (senderNameObj && typeof senderNameObj === "object"
      ? ((senderNameObj as { name?: string; phone?: string }).name || (senderNameObj as { name?: string; phone?: string }).phone)
      : undefined);
  const displaySenderName = typeof rawSenderName === "string" ? rawSenderName : undefined;

  // [SEC] Detect dark mode for inline style fallback
  const isDark =
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("dark") || document.body.classList.contains("dark"));

  const handleReact = (emoji: string) => {
    // Determine if user has already reacted with this exact emoji
    const reactions = message.reactions || [];
    const currentUserId = getCurrentUserId();
    const hasMyReact = reactions.some(
      (r) => r.content === emoji && (r.reactBy === "me" || r.isMe || r.reactBy === currentUserId)
    );

    // If already reacted, send empty string to remove reaction (like WhatsApp)
    const finalEmoji = hasMyReact ? "" : emoji;

    if (onReact) onReact(message.id, finalEmoji);
    setShowPicker(false);
  };

  // System messages (group events, protocol notices, "Ticket resolved", etc.)
  if (isSystem) {
    // Group history-sync stores content-less system/protocol events as placeholders.
    // Show a friendly label instead of the raw "[Mensaje]" / "[Sistema/Protocolo]".
    const systemLabel =
      message.content === "[Sistema/Protocolo]"
        ? "Evento del grupo"
        : message.content === "[Mensaje]"
          ? "Mensaje no disponible"
          : message.content;
    return (
      <div className="flex justify-center my-2">
        <div className="bg-black/5 dark:bg-white/5 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full text-xs max-w-md text-center">
          {systemLabel}
        </div>
      </div>
    );
  }

  const reactions = message.reactions || [];

  // Safely resolve media info since the API schema strictness might move it to metadata
  const mediaObj = message.metadata?.media as { type?: string, url?: string, size?: number } | undefined;
  const legacyFallback =
    message.content === "[AUDIO]" ? "audio" :
    message.content === "[IMAGE]" ? "image" :
    message.content === "[VIDEO]" ? "video" :
    message.content === "[DOCUMENT]" ? "document" :
    message.content === "[STICKER]" ? "sticker" : undefined;

  const msgType =
    mediaObj?.type?.toLowerCase() ||
    legacyFallback ||
    (message.type !== "text" ? (message.type as string)?.toLowerCase() : undefined) ||
    "text";

  const mediaUrl = (message.mediaUrl as string) || mediaObj?.url;

  const nameColor = displaySenderName ? getNameColor(displaySenderName) : undefined;

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex ${isAgent ? "justify-end" : "justify-start"} group/row relative ${
        reactions.length > 0 ? "pb-3.5 pt-1" : "py-1"
      }`}
    >
      <div
        className={`flex flex-col max-w-[85%] md:max-w-[70%] ${
          isAgent ? "items-end" : "items-start"
        } relative`}
      >
        {/* Side Reaction Container (Trigger Button + Quick Popover) */}
        {!isSystem && !isEditing && (
          <div
            ref={sideReactionRef}
            className={`absolute top-1/2 -translate-y-1/2 ${
              isAgent ? "-right-3 sm:right-full sm:mr-2" : "-left-3 sm:left-full sm:ml-2"
            } z-30`}
          >
            <ReactionTriggerButton
              isAgent={isAgent}
              isOpen={showPicker}
              onTogglePicker={() => setShowPicker(!showPicker)}
            />

            {showPicker && (
              <ReactionPicker
                isAgent={isAgent}
                isDark={isDark}
                reactions={reactions}
                showFullPicker={showFullPicker}
                onReact={handleReact}
                onOpenFullPicker={() => {
                  setShowFullPicker(true);
                }}
                onCloseFullPicker={() => {
                  setShowFullPicker(false);
                  setShowPicker(false);
                }}
                onClose={() => setShowPicker(false)}
              />
            )}
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`rounded-2xl ${isAgent ? "pl-8 pr-3" : "pl-3 pr-8"} py-1.5 min-w-[5.5rem] shadow-md transition-all relative group ${
            isAgent
              ? isWhisper
                ? "rounded-br-none bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 border border-amber-200/50 dark:border-amber-900/30"
                : "rounded-br-none bg-reply-brand text-white"
              : "rounded-bl-none border bg-slate-100 text-slate-900 border-slate-200 dark:bg-reply-panel-dark dark:text-reply-text-dark dark:border-reply-border-dark"
          }`}
        >
          {/* Action Dropdown Trigger (Chevron button at top-right corner inside reserved bubble padding) */}
          {!isSystem && !isEditing && (
            <MessageActionsBar
              isAgent={isAgent}
              isRevoked={isRevoked}
              isPinned={isPinned}
              isStarred={isStarred}
              canStar={canStar}
              canEditOrDelete={canEditOrDelete}
              hasOnPin={!!onPin}
              hasOnEdit={!!onEdit}
              hasOnDelete={!!onDelete}
              onPin={() => onPin && onPin(message.id, !isPinned)}
              onStar={() => onStar && onStar(message.id, !isStarred)}
              onTogglePicker={() => setShowPicker(!showPicker)}
              onReply={() => onReply && onReply(message)}
              onEditStart={() => {
                setEditValue(message.content);
                setIsEditing(true);
              }}
              onDeleteRequest={() => setShowDeleteConfirm(true)}
            />
          )}
          {/* Whisper header label */}
          {isWhisper && (
            <div className="text-[10px] font-black text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1 uppercase tracking-wider">
              <EyeOff className="w-3 h-3" />
              <span>Susurro Interno</span>
            </div>
          )}
          {/* Group Sender Name (Inside Bubble) - ONLY for groups */}
          {!isAgent && isGroup && displaySenderName && (
            <div
              className="text-[13px] font-bold mb-1 line-clamp-1"
              style={{ color: nameColor || "#e542a3" }}
            >
              {displaySenderName}
            </div>
          )}
          {/* Quoted Message (Reply Context) */}
          {message.metadata?.quotedMessageId && (
            <div
              className={`mb-2 p-2 rounded-lg border-l-4 bg-black/10 dark:bg-white/10 ${isAgent ? "border-white/40" : "border-indigo-500"} cursor-pointer hover:opacity-80 transition-opacity`}
              onClick={() => onQuoteClick && onQuoteClick()}
            >
              <div
                className={`text-[10px] font-bold mb-0.5 ${isAgent ? "text-white/80" : "text-indigo-600 dark:text-indigo-400"}`}
              >
                {message.metadata?.quotedContent ? "Respondiendo a:" : "Respondiendo a mensaje multimedia"}
              </div>
              <div
                className={`text-xs italic line-clamp-2 ${isAgent ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}
              >
                {message.metadata?.quotedContent || "Haga clic para ver el original"}
              </div>
            </div>
          )}

          {/* Media Content */}
          <MediaContent
            message={message}
            mediaUrl={mediaUrl}
            msgType={msgType}
            isAgent={isAgent}
            groupedMessages={groupedMessages}
            onImageClick={onImageClick}
          />

          {/* Inline Edit Mode */}
          {isEditing && (
            <div className="flex flex-col gap-2 min-w-[220px]">
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  } else if (e.key === "Escape") {
                    setIsEditing(false);
                  }
                }}
                rows={2}
                className={`w-full rounded-lg p-2 text-sm resize-none border focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  isAgent
                    ? "bg-white/10 border-white/30 text-white placeholder-white/50"
                    : "bg-white dark:bg-reply-surface-dark border-gray-300 dark:border-gray-600"
                }`}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => setIsEditing(false)}
                  className="p-1.5 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
                  title="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="p-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                  title="Guardar"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Revoked ("deleted for everyone") placeholder — same content/status
              contract as inbound revokes (MessageRevocationHandler.ts) */}
          {!isEditing && isRevoked && (
            <p className={`italic text-sm flex items-center gap-1.5 ${isAgent ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>
              <Trash2 className="w-3.5 h-3.5" />
              {message.content?.trim() || "Se eliminó este mensaje"}
            </p>
          )}

          {/* Text Content & Specialized Renderers */}
          {!isEditing && !isRevoked && msgType !== "location" && msgType !== "contact" && message.content && (
            <MessageText message={message} msgType={msgType} />
          )}

          {/* Inline timestamp + status (inside bubble, bottom-right corner — saves vertical space) */}
          <div
            className={`flex items-center justify-end gap-1 mt-0.5 -mb-0.5 select-none ${
              isAgent ? (isWhisper ? "text-amber-800/70 dark:text-amber-400/70" : "text-white/70") : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {isStarred && (
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
            )}
            {isEdited && !isRevoked && (
              <span className="text-[10px] leading-none italic opacity-80">Editado</span>
            )}
            <span className="text-[10px] leading-none whitespace-nowrap">
              {formatTime(message.timestamp)}
            </span>
            {isAgent && message.status && <MessageStatus status={message.status} />}
          </div>

          {/* Floating Reactions List (Subtle Enterprise Style) */}
          <FloatingReactions isAgent={isAgent} reactions={reactions} onReact={handleReact} />
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Eliminar mensaje para todos"
        message="Este mensaje se eliminará para ti y para el destinatario. Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

/**
 *  100-YEAR FIX: Memoization
 */
export const MessageBubble = React.memo(
  MessageBubbleComponent,
  (prevProps, nextProps) => {
    const prev = prevProps.message;
    const next = nextProps.message;

    if (prev.id !== next.id) return false;
    if (prev.status !== next.status) return false;
    if (prev.content !== next.content) return false;
    if (JSON.stringify(prev.reactions) !== JSON.stringify(next.reactions)) return false;
    if (
      (prev.metadata as Record<string, unknown> | undefined)?.starred !==
      (next.metadata as Record<string, unknown> | undefined)?.starred
    ) return false;
    if (
      (prev.metadata as Record<string, unknown> | undefined)?.isEdited !==
      (next.metadata as Record<string, unknown> | undefined)?.isEdited
    ) return false;
    if (
      (prev.metadata as Record<string, unknown> | undefined)?.isPinned !==
      (next.metadata as Record<string, unknown> | undefined)?.isPinned
    ) return false;

    if (Math.abs(new Date(prev.timestamp).getTime() - new Date(next.timestamp).getTime()) > 1000) {
      return false;
    }

    if (prevProps.isGroup !== nextProps.isGroup) return false;

    return true;
  },
);
