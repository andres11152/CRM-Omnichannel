/**
 * STRICTLY TYPED REACT COMPONENTS
 *
 * NO any ALLOWED - Examples of properly typed components
 * State, props, and events are all FULLY typed
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ConversationListItem,
  ConversationDetail,
  Message,
  MessageCreate,
  ConversationState,
  MessageState,
  ConversationStatus,
} from "../types/domain";
import { conversationApi, messageApi } from "../api/client";
import { validateForm, MessageFormSchema } from "../types/validation";

// ============================================
// COMPONENT PROPS (Strictly Typed)
// ============================================

interface ConversationListProps {
  onSelectConversation: (conversation: ConversationListItem) => void;
  selectedId?: string;
}

interface ConversationDetailProps {
  conversationId: string;
  onClose: () => void;
}

interface MessageListProps {
  conversationId: string;
  messages: Message[];
  onLoadMore?: () => void;
  hasMore: boolean;
  loading: boolean;
}

interface MessageInputProps {
  conversationId: string;
  onSendMessage: (message: MessageCreate) => Promise<void>;
  disabled?: boolean;
}

// ============================================
// CONVERSATION LIST COMPONENT
// ============================================

export const ConversationList: React.FC<ConversationListProps> = ({
  onSelectConversation,
  selectedId,
}) => {
  // ✅ STRICTLY TYPED STATE
  const [state, setState] = useState<ConversationState>({
    conversations: [],
    selectedConversation: null,
    loading: true,
    error: null,
    pagination: {
      hasMore: false,
      nextCursor: null,
    },
  });

  // ✅ TYPED ASYNC FUNCTION
  const loadConversations = useCallback(async (cursor?: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await conversationApi.list({
        cursor,
        limit: 50,
      });

      setState((prev) => ({
        ...prev,
        conversations: cursor
          ? [...prev.conversations, ...response.data.conversations]
          : response.data.conversations,
        pagination: {
          hasMore: response.data.pagination.hasMore,
          nextCursor: response.data.pagination.nextCursor,
        },
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load conversations",
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ✅ TYPED EVENT HANDLER
  const handleLoadMore = useCallback(() => {
    if (state.pagination.nextCursor && !state.loading) {
      loadConversations(state.pagination.nextCursor);
    }
  }, [state.pagination.nextCursor, state.loading, loadConversations]);

  // ✅ TYPED onClick HANDLER
  const handleConversationClick = (conversation: ConversationListItem) => {
    onSelectConversation(conversation);
  };

  if (state.error) {
    return (
      <div className="error">
        <p>Error: {state.error}</p>
        <button onClick={() => loadConversations()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="conversation-list">
      {state.conversations.map((conversation) => (
        <ConversationCard
          key={conversation.id}
          conversation={conversation}
          isSelected={conversation.id === selectedId}
          onClick={() => handleConversationClick(conversation)}
        />
      ))}

      {state.loading && <div className="loading">Loading...</div>}

      {state.pagination.hasMore && !state.loading && (
        <button onClick={handleLoadMore}>Load More</button>
      )}
    </div>
  );
};

// ============================================
// CONVERSATION CARD (Sub-component)
// ============================================

interface ConversationCardProps {
  conversation: ConversationListItem;
  isSelected: boolean;
  onClick: () => void;
}

const ConversationCard: React.FC<ConversationCardProps> = ({
  conversation,
  isSelected,
  onClick,
}) => {
  // ✅ TYPED STATUS BADGE
  const getStatusBadge = (status: ConversationStatus): React.ReactNode => {
    const badges: Record<
      ConversationStatus,
      { text: string; className: string }
    > = {
      [ConversationStatus.OPEN]: { text: "Open", className: "badge-open" },
      [ConversationStatus.IN_PROGRESS]: {
        text: "In Progress",
        className: "badge-progress",
      },
      [ConversationStatus.RESOLVED]: {
        text: "Resolved",
        className: "badge-resolved",
      },
      [ConversationStatus.CLOSED]: {
        text: "Closed",
        className: "badge-closed",
      },
    };

    const badge = badges[status];
    return <span className={`badge ${badge.className}`}>{badge.text}</span>;
  };

  return (
    <div
      className={`conversation-card ${isSelected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="conversation-header">
        <h3>{conversation.subject || "No Subject"}</h3>
        {getStatusBadge(conversation.status)}
      </div>

      {conversation.typingStatus && conversation.typingStatus !== "paused" ? (
        <div className="last-message typing-indicator">
          <span
            className="typing-text"
            style={{ color: "#25D366", fontWeight: "bold" }}
          >
            {conversation.typingStatus === "recording"
              ? "🎤 Grabando audio..."
              : "✍️ Escribiendo..."}
          </span>
        </div>
      ) : (
        conversation.lastMessage && (
          <div className="last-message">
            <span className="sender">
              {conversation.lastMessage.sender.name}:
            </span>
            <span className="content">{conversation.lastMessage.content}</span>
          </div>
        )
      )}

      <div className="conversation-footer">
        <span className="message-count">
          {conversation.messageCount} messages
        </span>
        {conversation.assignedTo && (
          <span className="assigned-to">
            Assigned to {conversation.assignedTo.name}
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================
// MESSAGE LIST COMPONENT
// ============================================

export const MessageList: React.FC<MessageListProps> = ({
  conversationId,
  messages,
  onLoadMore,
  hasMore,
  loading,
}) => {
  // ✅ TYPED useEffect
  useEffect(() => {
    // Scroll to bottom on new messages
    const messagesContainer = document.getElementById("messages-container");
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div id="messages-container" className="message-list">
      {hasMore && onLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="load-more-messages"
        >
          {loading ? "Loading..." : "Load Previous Messages"}
        </button>
      )}

      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
};

// ============================================
// MESSAGE BUBBLE (Sub-component)
// ============================================

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isOutbound = message.direction === "OUTBOUND";

  return (
    <div className={`message-bubble ${isOutbound ? "outbound" : "inbound"}`}>
      <div className="message-sender">{message.sender.name}</div>
      <div className="message-content">{message.content}</div>

      {message.metadata?.media && (
        <div className="message-media">
          {message.metadata.media.type === "image" && (
            <img src={message.metadata.media.url} alt="attachment" />
          )}
          {message.metadata.media.type === "document" && (
            <a
              href={message.metadata.media.url}
              target="_blank"
              rel="noreferrer"
            >
              📄 {message.metadata.media.name || "Document"}
            </a>
          )}
        </div>
      )}

      <div className="message-time">
        {new Date(message.createdAt).toLocaleTimeString()}
      </div>
    </div>
  );
};

// ============================================
// MESSAGE INPUT COMPONENT
// ============================================

// ... imports
import { socketService } from "../../services/socketService";

// ... inside MessageInput
export const MessageInput: React.FC<MessageInputProps> = ({
  conversationId,
  onSendMessage,
  disabled = false,
}) => {
  // ✅ TYPED FORM STATE
  const [content, setContent] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch conversation to get customer phone for typing status
  const { conversation } = useConversation(conversationId);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ TYPING INDICATOR HANDLER
  const handleTyping = () => {
    if (!conversation?.contact?.phone) return;

    // Emit 'composing'
    socketService.emit("conversation:typing", {
      to: conversation.contact.phone,
      status: "composing",
    });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to emit 'paused' after 3s of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socketService.emit("conversation:typing", {
        to: conversation.contact.phone,
        status: "paused",
      });
    }, 3000);
  };

  // ✅ TYPED FORM HANDLER
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!content.trim()) return;

    // Validate with Zod
    const validation = validateForm(MessageFormSchema, { content });

    if (!validation.success) {
      setError(Object.values(validation.errors)[0] || "Validation error");
      return;
    }

    setSending(true);
    setError(null);

    try {
      await onSendMessage({
        content: content.trim(),
        conversationId,
      });

      // Clear input on success
      setContent("");

      // Clear typing status immediately
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (conversation?.contact?.phone) {
        socketService.emit("conversation:typing", {
          to: conversation.contact.phone,
          status: "paused",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // ✅ TYPED INPUT HANDLER
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (error) setError(null);
    handleTyping();
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // ✅ TYPED KEY HANDLER
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true }),
        );
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="message-input">
      {error && <div className="error-message">{error}</div>}

      <textarea
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
        disabled={disabled || sending}
        rows={3}
      />

      <button type="submit" disabled={!content.trim() || disabled || sending}>
        {sending ? "Sending..." : "Send"}
      </button>
    </form>
  );
};

// ============================================
// CUSTOM HOOKS (Strictly Typed)
// ============================================

/**
 * Hook for managing conversation state
 */
export function useConversation(conversationId: string | null) {
  const [state, setState] = useState<{
    conversation: ConversationDetail | null;
    loading: boolean;
    error: string | null;
  }>({
    conversation: null,
    loading: false,
    error: null,
  });

  const loadConversation = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await conversationApi.get(id);
      setState({
        conversation: response.data?.conversation || null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        conversation: null,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load conversation",
      });
    }
  }, []);

  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, loadConversation]);

  return {
    ...state,
    reload: () => conversationId && loadConversation(conversationId),
  };
}

/**
 * Hook for sending messages
 */
export function useSendMessage() {
  const [sending, setSending] = useState<boolean>(false);

  const sendMessage = useCallback(
    async (data: MessageCreate): Promise<void> => {
      setSending(true);
      try {
        await messageApi.send(data);
      } finally {
        setSending(false);
      }
    },
    [],
  );

  return { sendMessage, sending };
}
