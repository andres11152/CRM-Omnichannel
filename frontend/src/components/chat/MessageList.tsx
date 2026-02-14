import React, { useEffect, useRef } from "react";
import { type Message } from "@/services/chatService";
import { MessageBubble } from "./MessageBubble";

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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
          <div className="text-6xl mb-4">💬</div>
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
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-4 bg-reply-bg dark:bg-reply-bg-dark"
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
  );
};

/**
 * DATE DIVIDER COMPONENT
 * Shows date separator between messages
 */
const DateDivider: React.FC<{ date: string }> = ({ date }) => {
  const formatDate = (timestamp: string) => {
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
const isNewDay = (prevTimestamp: string, currentTimestamp: string): boolean => {
  const prevDate = new Date(prevTimestamp).toDateString();
  const currentDate = new Date(currentTimestamp).toDateString();
  return prevDate !== currentDate;
};
