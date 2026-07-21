import React from "react";
import { Message } from "@/types";
import { getCurrentUserId } from "./helpers";

type MessageReaction = NonNullable<Message["reactions"]>[number];

interface FloatingReactionsProps {
  isAgent: boolean;
  reactions: MessageReaction[];
  onReact: (emoji: string) => void;
}

/**
 * Subtle floating pill showing applied reactions, anchored to the bottom
 * corner of a message bubble (WhatsApp/Telegram style).
 */
export const FloatingReactions: React.FC<FloatingReactionsProps> = ({ isAgent, reactions, onReact }) => {
  if (reactions.length === 0) return null;

  return (
    <div
      className={`absolute -bottom-2 ${isAgent ? "right-1" : "left-1"} flex items-center bg-white/90 dark:bg-reply-elevated-dark/90 backdrop-blur-md rounded-full px-1.5 py-0.5 shadow-sm border border-gray-100 dark:border-white/10 z-20 transition-all hover:scale-105 hover:shadow-md cursor-pointer group/reacts`}
    >
      <div className="flex items-center -space-x-0.5">
        {Array.from(new Set(reactions.map((r) => r.content)))
          .slice(0, 3)
          .map((emoji, idx) => {
            const currentUserId = getCurrentUserId();
            const myReact = reactions.find((r) => r.content === emoji && (r.reactBy === "me" || r.isMe || r.reactBy === currentUserId));
            const hasMyReact = !!myReact;

            return (
              <span
                key={idx}
                className={`text-[11px] leading-none p-0.5 rounded-full transition-all ${hasMyReact ? "bg-indigo-500/10 scale-110" : ""}`}
                title={hasMyReact ? "Haz clic para quitar tu reacción" : "Reacción"}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(emoji);
                }}
              >
                {emoji}
              </span>
            );
          })}
      </div>
      {reactions.length > 1 && (
        <span className="text-[9px] ml-1 text-gray-500 dark:text-gray-400 font-bold pr-0.5">{reactions.length}</span>
      )}
    </div>
  );
};
