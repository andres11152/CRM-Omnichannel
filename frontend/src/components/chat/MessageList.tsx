import React, { useEffect, useRef, useState } from "react";
import { Message } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { ChevronDown } from "lucide-react";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
}

/**
 * MESSAGE LIST COMPONENT
 * Displays list of messages with auto-scroll to bottom
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Show button if we are more than 300px away from the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 300;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-reply-brand mx-auto mb-4"></div>
          <p className="text-gray-500">Cargando mensajes...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-6xl mb-4">[CHAT]</div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
            No hay mensajes
          </h3>
          <p className="text-gray-500">
            Envía el primer mensaje para iniciar la conversación
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-reply-bg dark:bg-reply-bg-dark scroll-smooth"
      >
        {messages.map((message, index) => {
          const showDateDivider =
            index === 0 ||
            isNewDay(messages[index - 1].timestamp, message.timestamp);

          return (
            <React.Fragment key={message.id}>
              {showDateDivider && <DateDivider date={message.timestamp} />}
              <MessageBubble message={message} />
            </React.Fragment>
          );
        })}

        {/* Invisible element at the end for auto-scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 p-3 bg-reply-surface dark:bg-reply-panel-dark text-reply-brand rounded-full shadow-lg border border-reply-border dark:border-reply-border-dark hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300 animate-in fade-in zoom-in slide-in-from-bottom-4 cursor-pointer z-10"
          title="Bajar al final"
        >
          <ChevronDown size={24} className="animate-bounce" />
        </button>
      )}
    </div>
  );
};

/**
 * DATE DIVIDER COMPONENT
 * Shows date separator between messages
 */
const DateDivider: React.FC<{ date: string | Date }> = ({ date }) => {
  const formatDate = (timestamp: string | Date) => {
    const messageDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = messageDate.toDateString() === today.toDateString();
    const isYesterday = messageDate.toDateString() === yesterday.toDateString();

    if (isToday) return "Hoy";
    if (isYesterday) return "Ayer";

    return messageDate.toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="flex items-center justify-center my-4">
      <div className="bg-gray-200 dark:bg-gray-700 px-4 py-1 rounded-full text-xs text-gray-600 dark:text-gray-400 font-medium">
        {formatDate(date)}
      </div>
    </div>
  );
};

/**
 * HELPER: Check if two timestamps are on different days
 */
const isNewDay = (prevTimestamp: string | Date, currentTimestamp: string | Date): boolean => {
  const prevDate = new Date(prevTimestamp).toDateString();
  const currentDate = new Date(currentTimestamp).toDateString();
  return prevDate !== currentDate;
};
