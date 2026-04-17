import React from "react";
import { type Conversation } from "@/types";
import { MessageSquare, Mail, Globe, Plus, ChevronRight, User } from "lucide-react";

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
        <MessageSquare size={48} className="text-gray-300 dark:text-gray-700 mb-4" />
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
      <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark">
        <div className="flex gap-2">
          <button
            onClick={onNewChat}
            className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2"
          >
            <Plus size={16} />
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
            key={conversation.ticketId || conversation.id}
            conversation={conversation}
            isSelected={(conversation.ticketId || conversation.id) === selectedTicketId}
            onClick={() => onSelectConversation(conversation.ticketId || conversation.id)}
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
  const formatTime = (timestamp: string | Date) => {
    if (!timestamp) return "";
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
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
      case "WHATSAPP":
        return <MessageSquare size={14} />;
      case "EMAIL":
        return <Mail size={14} />;
      case "WEB_CHAT":
        return <Globe size={14} />;
      default:
        return <MessageSquare size={14} />;
    }
  };

  const getStatusColor = () => {
    switch (conversation.status) {
      case "OPEN":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "PENDING":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "RESOLVED":
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-200 dark:border-reply-border-dark cursor-pointer transition-colors ${
        isSelected
          ? "bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-600"
          : "hover:bg-reply-bg dark:hover:bg-gray-800/50"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold border border-slate-200 dark:border-slate-700 flex-shrink-0 relative">
          <User size={24} />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
            {getChannelIcon()}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name and Time */}
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-semibold text-gray-900 dark:text-white truncate">
              {conversation.contactName || "Desconocido"}
            </h4>
            <span className="text-xs text-gray-500 ml-2">
              {formatTime(conversation.lastMessageTime || conversation.lastMessageAt || "")}
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


