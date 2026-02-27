import React from "react";
import { type Message } from "@/services/chatService";

interface MessageBubbleProps {
  message: Message;
}

/**
 * MESSAGE BUBBLE COMPONENT
 * Renders individual message bubble with different styles for agent/customer
 * 🚀 Memoized to prevent re-renders during optimistic update reconciliation
 */
const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({ message }) => {
  const isAgent = message.sender === "agent";
  const isSystem = message.sender === "system";

  // 🛡️ Detect dark mode for inline style fallback
  const isDark =
    (typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches) ||
    document.documentElement.classList.contains("dark");

  // System messages (e.g., "Ticket resolved")
  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-lg text-sm max-w-md text-center">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex flex-col max-w-[85%] md:max-w-[70%] ${
          isAgent ? "items-end" : "items-start"
        }`}
      >
        {/* Sender Name (only for customer messages) */}
        {!isAgent && message.senderName && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-2">
            {message.senderName}
          </div>
        )}

        {/* Message Bubble — 🛡️ 100-YEAR FIX: Inline styles guarantee visibility */}
        <div
          className={`rounded-2xl px-4 py-2 shadow-md transition-all relative group ${
            isAgent ? "rounded-br-none" : "rounded-bl-none border"
          }`}
          style={
            isAgent
              ? { backgroundColor: "#00a884", color: "#ffffff" }
              : isDark
                ? {
                    backgroundColor: "#202c33",
                    color: "#e9edef",
                    borderColor: "#2a3942",
                  }
                : {
                    backgroundColor: "#ffffff",
                    color: "#111b21",
                    borderColor: "#e9edef",
                  }
          }
        >
          {/* Quoted Message (Reply Context) */}
          {message.metadata?.quotedMessageId && (
            <div
              className={`mb-2 p-2 rounded-lg border-l-4 bg-black/5 dark:bg-white/5 ${isAgent ? "border-white/40" : "border-indigo-500"}`}
            >
              <div
                className={`text-[10px] font-bold mb-0.5 ${isAgent ? "text-white/80" : "text-indigo-600 dark:text-indigo-400"}`}
              >
                {message.metadata.quotedContent
                  ? "Respondiendo a:"
                  : "Respondiendo a mensaje multimedia"}
              </div>
              <div
                className={`text-xs italic line-clamp-2 ${isAgent ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}
              >
                {message.metadata.quotedContent ||
                  "Haga clic para ver el original"}
              </div>
            </div>
          )}

          {/* Media Content */}
          {message.type === "image" && message.mediaUrl && (
            <img
              src={message.mediaUrl}
              alt="Imagen"
              className="rounded-lg mb-2 max-w-full h-auto"
            />
          )}
          {message.type === "video" && message.mediaUrl && (
            <video
              src={message.mediaUrl}
              controls
              className="rounded-lg mb-2 max-w-full h-auto"
            />
          )}
          {message.type === "audio" && message.mediaUrl && (
            <audio
              src={message.mediaUrl}
              controls
              className="mb-2 max-w-full"
            />
          )}
          {message.type === "document" && message.mediaUrl && (
            <a
              href={message.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-500 hover:underline mb-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Descargar archivo
            </a>
          )}

          {/* Text Content */}
          {message.content && (
            <p
              className="whitespace-pre-wrap"
              style={{
                wordBreak: "break-word",
                overflowWrap: "anywhere", // 🛡️ Forces break on long strings like emails
              }}
            >
              {message.content}
            </p>
          )}
        </div>

        {/* Timestamp and Status */}
        <div
          className={`flex items-center gap-2 mt-1 ${isAgent ? "justify-end" : "justify-start"}`}
        >
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(message.timestamp)}
          </span>

          {/* Message Status (only for agent messages) */}
          {isAgent && message.status && (
            <MessageStatus status={message.status} />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * MESSAGE STATUS INDICATOR
 * Shows checkmarks for message delivery status
 */
const MessageStatus: React.FC<{ status: Message["status"] }> = ({ status }) => {
  const getStatusIcon = () => {
    switch (status) {
      case "sending":
        return (
          <svg
            className="w-3 h-3 text-gray-400 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        );
      case "sent":
        return (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "delivered":
        return (
          <div className="flex -space-x-1">
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        );
      case "read":
        return (
          <div className="flex -space-x-1">
            <svg
              className="w-4 h-4 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <svg
              className="w-4 h-4 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        );
      case "failed":
        return (
          <svg
            className="w-4 h-4 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return <div className="flex items-center">{getStatusIcon()}</div>;
};

/**
 * HELPER: Format timestamp
 */
const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * 🚀 100-YEAR FIX: Memoization to prevent flashback
 * Only re-render if message content, status, or ID changed
 */
export const MessageBubble = React.memo(
  MessageBubbleComponent,
  (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render)
    // Return false if props changed (trigger re-render)
    const prev = prevProps.message;
    const next = nextProps.message;

    // ID changed (temp -> real): MUST re-render to update key
    if (prev.id !== next.id) return false;

    // Status changed (sending -> sent): MUST re-render for checkmark
    if (prev.status !== next.status) return false;

    // Content changed: MUST re-render
    if (prev.content !== next.content) return false;

    // Timestamp changed significantly (more than 1 second): re-render
    if (
      Math.abs(
        new Date(prev.timestamp).getTime() - new Date(next.timestamp).getTime(),
      ) > 1000
    ) {
      return false;
    }

    // Everything else is the same: SKIP re-render
    return true;
  },
);
