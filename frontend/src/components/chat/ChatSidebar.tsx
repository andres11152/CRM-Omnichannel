import React from "react";
import { type Conversation } from "../../../services/chatService";

interface ChatSidebarProps {
  conversations: Conversation[];
  selectedTicketId: string | null;
  loading: boolean;
  onSelectConversation: (ticketId: string) => void;
  onNewChat: () => void;
  onPickNext: () => void;
}

/**
 * CHAT SIDEBAR COMPONENT
 * Displays list of conversations with search and filters
 */
export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversations,
  selectedTicketId,
  loading,
  onSelectConversation,
  onNewChat,
  onPickNext,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando conversaciones...</div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <div className="text-4xl mb-4">💬</div>
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
          No hay conversaciones
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Inicia un nuevo chat o toma el siguiente ticket
        </p>
        <div className="flex gap-2">
          <button
            onClick={onNewChat}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
          >
            Nuevo Chat
          </button>
          <button
            onClick={onPickNext}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Tomar Siguiente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Actions */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={onNewChat}
            className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nuevo
          </button>
          <button
            onClick={onPickNext}
            className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.ticketId}
            conversation={conversation}
            isSelected={conversation.ticketId === selectedTicketId}
            onClick={() => onSelectConversation(conversation.ticketId)}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * CONVERSATION ITEM COMPONENT
 * Individual conversation row in the sidebar
 */
interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isSelected,
  onClick,
}) => {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("es-ES", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const getChannelIcon = () => {
    switch (conversation.channel) {
      case "whatsapp":
        return "💬";
      case "email":
        return "📧";
      case "web":
        return "🌐";
      default:
        return "💬";
    }
  };

  const getStatusColor = () => {
    switch (conversation.status) {
      case "open":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "pending":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "resolved":
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors ${
        isSelected
          ? "bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-600"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {getChannelIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name and Time */}
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-semibold text-gray-900 dark:text-white truncate">
              {conversation.contactName}
            </h4>
            <span className="text-xs text-gray-500 ml-2">
              {formatTime(conversation.lastMessageTime)}
            </span>
          </div>

          {/* Last Message */}
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate mb-2">
            {conversation.lastMessage}
          </p>

          {/* Status and Unread Badge */}
          <div className="flex items-center justify-between">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor()}`}
            >
              {conversation.status}
            </span>
            {conversation.unreadCount > 0 && (
              <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
