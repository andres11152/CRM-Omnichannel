import React from "react";
import { Plus } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Message } from "@/types";
import { getCurrentUserId } from "./helpers";

const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
type MessageReaction = NonNullable<Message["reactions"]>[number];

interface ReactionPickerProps {
  isAgent: boolean;
  isDark: boolean;
  reactions: MessageReaction[];
  showFullPicker: boolean;
  onReact: (emoji: string) => void;
  onOpenFullPicker: () => void;
  onCloseFullPicker: () => void;
}

/**
 * The quick-emoji popover (opened from the message hover pill) plus the
 * full emoji-mart-style picker overlay it can expand into.
 */
export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  isAgent,
  isDark,
  reactions,
  showFullPicker,
  onReact,
  onOpenFullPicker,
  onCloseFullPicker,
}) => {
  return (
    <>
      <div
        className={`absolute bottom-full mb-3 ${isAgent ? "right-0" : "left-0"} z-50 bg-white/90 dark:bg-reply-elevated-dark/95 backdrop-blur-xl rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-200/50 dark:border-white/10 p-1.5 flex items-center gap-1.5 animate-in fade-in zoom-in-90 slide-in-from-bottom-2 duration-200`}
      >
        {QUICK_EMOJIS.map((emoji) => {
          const currentUserId = getCurrentUserId();
          const hasMyReact = reactions.some(
            (r) => r.content === emoji && (r.reactBy === "me" || r.isMe || r.reactBy === currentUserId)
          );
          return (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className={`text-xl hover:scale-125 hover:-translate-y-1 active:scale-95 transition-all duration-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 ${hasMyReact ? "bg-indigo-100 dark:bg-indigo-500/30" : ""}`}
              title={hasMyReact ? "Quitar reacción" : "Reaccionar"}
            >
              {emoji}
            </button>
          );
        })}
        <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-0.5" />
        <button
          onClick={onOpenFullPicker}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-600 text-gray-500 dark:text-gray-400 transition-all duration-200 shadow-sm"
          title="Más emojis"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {showFullPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onCloseFullPicker}>
          <div className="relative animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <EmojiPicker
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              onEmojiClick={(emojiData) => {
                onReact(emojiData.emoji);
                onCloseFullPicker();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};
