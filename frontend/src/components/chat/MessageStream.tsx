import React, { useRef, useEffect } from "react";
import { Message, SenderType } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { Clock } from "lucide-react";

interface MessageStreamProps {
  messages: Message[];
  isTyping: boolean;
  isRemoteTyping: boolean;
  isSyncing: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
  scrollToMessage: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (msg: Message) => void;
  isGroup?: boolean;
}



const DateDivider: React.FC<{ timestamp: string | Date }> = ({ timestamp }) => {
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    if (isNaN(d.getTime())) return "Fecha desconocida";
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayDate = new Date(nowDate);
    yesterdayDate.setDate(nowDate.getDate() - 1);
    if (dDate.getTime() === nowDate.getTime()) return "Hoy";
    if (dDate.getTime() === yesterdayDate.getTime()) return "Ayer";
    const diffTime = nowDate.getTime() - dDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 7 && diffDays > 0) {
      return d.toLocaleDateString("es-ES", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
    }
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "numeric", year: "numeric" });
  };
  return (
    <div className="flex items-center justify-center my-3 sticky top-2 z-10 pointer-events-none">
      <div className="bg-gray-100/80 dark:bg-[#1f2c34]/80 backdrop-blur-sm px-3 py-1 rounded shadow-sm text-[10.5px] text-gray-500 dark:text-gray-400 font-medium pointer-events-auto leading-none">
        {formatDate(timestamp)}
      </div>
    </div>
  );
};

export const MessageStream: React.FC<MessageStreamProps> = ({
  messages,
  isTyping,
  isRemoteTyping,
  isSyncing,
  chatEndRef,
  scrollToMessage,
  onReact,
  onReply,
  isGroup,
}) => {
  // Group messages by day for professional sticky header behavior
  const groupedMessages = React.useMemo(() => {
    const groups: { [key: string]: Message[] } = {};
    messages.forEach((msg) => {
      const dateKey = msg.timestamp 
        ? new Date(msg.timestamp).toDateString() 
        : "Fecha desconocida";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(msg);
    });
    return Object.entries(groups);
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2 relative bg-[#efeae2] dark:bg-[#0b141a] custom-scrollbar">
      {/* [SEC] SYNC INDICATOR */}
      {isSyncing && (
        <div className="flex items-center justify-center py-2 sticky top-0 z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-indigo-50/90 dark:bg-indigo-900/40 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm text-[11px] font-bold text-indigo-600 dark:text-indigo-300 animate-pulse border border-indigo-200 dark:border-indigo-800 pointer-events-auto">
            <Clock className="w-3.5 h-3.5 animate-spin-slow" />
            Sincronizando historial...
          </div>
        </div>
      )}

      {groupedMessages.map(([day, dayMessages]) => (
        <div key={day} className="relative space-y-2">
          {/* Section Header: Sticky per day */}
          <DateDivider timestamp={dayMessages[0].timestamp} />
          
          {dayMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isGroup={isGroup}
              onQuoteClick={() =>
                message.metadata?.quotedMessageId
                  ? scrollToMessage(message.metadata.quotedMessageId as string)
                  : null
              }
              onReact={(id, emoji) => onReact(id, emoji)}
              onReply={() => onReply(message)}
            />
          ))}
        </div>
      ))}

      {/* TYPING INDICATORS */}
      {isRemoteTyping && (
        <div className="flex items-start mb-4">
          <div className="bg-white dark:bg-[#1f2c34] px-4 py-2.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></span>
            </div>
          </div>
        </div>
      )}

      {isTyping && (
        <div className="flex items-end justify-end mb-4">
          <div className="bg-indigo-600 dark:bg-indigo-500 px-4 py-2.5 rounded-2xl rounded-tr-none shadow-sm flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce"></span>
            </div>
          </div>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
};
