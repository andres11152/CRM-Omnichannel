import { useEffect } from "react";
import { useQueryClient, QueryClient } from "@tanstack/react-query";
import { socketService } from "../../services/socketService";
import {
  addMessageToCache,
  updateConversationInCache,
  CHAT_KEYS,
} from "./useChat";
import { type Message, type Conversation } from "../../services/chatService";
import { type Ticket } from "../../types";

// 🔒 STRICT SOCKET TYPES
interface RawSocketMessage {
  id: string;
  content: string;
  createdAt?: string | Date;
  timestamp?: string | Date;
  direction?: "INBOUND" | "OUTBOUND";
  senderId?: string;
  type?: "text" | "image" | "video" | "audio" | "document";
  ticketId?: string;
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown; // Safe unknown for extra props
}

interface SocketMessagePayload {
  ticketId: string;
  message: RawSocketMessage;
  conversation: Partial<Conversation>;
}

interface SocketConversationPayload {
  ticketId: string;
  updates: Partial<Conversation>;
}

interface SocketTicketPayload {
  ticketId: string;
}

/**
 * CUSTOM HOOK: useChatSockets
 * Integrates Socket.IO real-time events with React Query cache
 *
 * Instead of triggering full refetches, this hook directly updates
 * the React Query cache when receiving socket events.
 */
export const useChatSockets = (currentTicketId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    /**
     * SOCKET EVENT: message.received
     * Fires when a new message arrives from customer
     */
    const handleMessageReceived = (payload: SocketMessagePayload) => {
      // 1. Normalize Socket Payload to match Frontend Message Interface
      const rawMsg = payload.message;
      const normalizedMessage: Message = {
        ...rawMsg,
        ticketId: payload.ticketId,
        type: rawMsg.type || "text",
        timestamp: rawMsg.createdAt
          ? new Date(rawMsg.createdAt).toISOString()
          : typeof rawMsg.timestamp === "string"
            ? rawMsg.timestamp
            : new Date(rawMsg.timestamp || Date.now()).toISOString(),
        sender: rawMsg.direction === "OUTBOUND" ? "agent" : "customer",
      };

      // 2. Add to cache with deduplication logic
      addMessageToCache(queryClient, payload.ticketId, normalizedMessage);

      // Update conversation metadata
      if (payload.conversation) {
        updateConversationInCache(queryClient, payload.ticketId, {
          lastMessage: payload.message.content,
          lastMessageTime: payload.message.timestamp
            ? new Date(payload.message.timestamp).toISOString()
            : new Date().toISOString(),
          unreadCount: payload.conversation.unreadCount || 0,
        });
      }

      // Invalidate conversations to ensure consistency
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
    };

    /**
     * SOCKET EVENT: conversation.updated
     * Fires when conversation metadata changes (assigned, status, etc.)
     */
    const handleConversationUpdated = (payload: SocketConversationPayload) => {
      // Update specific conversation in cache
      updateConversationInCache(queryClient, payload.ticketId, payload.updates);

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
    };

    /**
     * SOCKET EVENT: ticket.deleted
     * Fires when a ticket is deleted
     */
    const handleTicketDeleted = (payload: { ticketId: string }) => {
      // Remove from conversations
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });

      // Remove messages from cache
      queryClient.removeQueries({
        queryKey: CHAT_KEYS.messages(payload.ticketId),
      });
    };

    /**
     * SOCKET EVENT: message.status
     * Fires when message status changes (sent, delivered, read)
     */
    const handleMessageStatus = (payload: {
      ticketId: string;
      messageId: string;
      status: "sent" | "delivered" | "read";
    }) => {
      // Update message status in cache
      queryClient.setQueryData<Message[]>(
        CHAT_KEYS.messages(payload.ticketId),
        (old = []) =>
          old.map((msg) =>
            msg.id === payload.messageId
              ? { ...msg, status: payload.status }
              : msg,
          ),
      );
    };

    /**
     * SOCKET EVENT: ticket.created
     * Fires when a new ticket is created
     */
    const handleTicketCreated = (payload: Ticket) => {
      // Invalidate conversations to fetch the new ticket
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
    };

    /**
     * SOCKET EVENT: conversation.created
     * Fires when a new conversation is created (real-time sync)
     */
    const handleConversationCreated = (payload: Conversation) => {
      // Invalidate to get latest list with new conversation
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
    };

    /**
     * SOCKET EVENT: conversation.closed
     * Fires when a conversation is closed
     */
    const handleConversationClosed = (payload: Partial<Conversation>) => {
      // Update conversation status in cache
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
    };

    /**
     * SOCKET EVENT: conversation:typing
     * Fires when a customer is typing
     */
    const handleConversationTyping = (payload: {
      conversationId: string;
      from: string;
      status: "composing" | "recording" | "paused";
    }) => {
      // 1. Update status immediately
      updateConversationTypingStatus(
        queryClient,
        payload.conversationId,
        payload.status,
      );

      // 2. Auto-clear status after 6 seconds (Safety Net)
      // This prevents "typing..." from getting stuck if "paused" event is dropped
      if (payload.status !== "paused") {
        setTimeout(() => {
          updateConversationTypingStatus(
            queryClient,
            payload.conversationId,
            "paused",
          );
        }, 6000);
      }
    };

    // Subscribe to socket events
    socketService.on("message.received", handleMessageReceived);
    socketService.on("conversation.updated", handleConversationUpdated);
    socketService.on("ticket.deleted", handleTicketDeleted);
    socketService.on("message.status", handleMessageStatus);
    socketService.on("ticket.created", handleTicketCreated);
    socketService.on("conversation.closed", handleConversationClosed);
    socketService.on("conversation:typing", handleConversationTyping); // ✅ NEW

    // Cleanup on unmount
    return () => {
      socketService.off("message.received", handleMessageReceived);
      socketService.off("conversation.updated", handleConversationUpdated);
      socketService.off("ticket.deleted", handleTicketDeleted);
      socketService.off("message.status", handleMessageStatus);
      socketService.off("ticket.created", handleTicketCreated);
      socketService.off("conversation.closed", handleConversationClosed);
      socketService.off("conversation:typing", handleConversationTyping); // ✅ NEW
    };
  }, [queryClient, currentTicketId]);

  /**
   * HELPER: Update Conversation Typing Status
   * Updates the ephemeral typing state in the conversation list
   */
  const updateConversationTypingStatus = (
    queryClient: QueryClient,
    conversationId: string,
    status: "composing" | "recording" | "paused",
  ) => {
    console.log(
      `[Frontend] 🟢 Updating Typing Status: ${status} for Conv ${conversationId}`,
    );

    // 100-YEAR FIX: Use setQueriesData to match ALL conversation lists
    // regardless of status filter (open, pending, resolved, undefined)
    queryClient.setQueriesData<{
      conversations: Conversation[];
      total: number;
    }>(
      { queryKey: ["conversations"] }, // Partial match on key
      (old) => {
        if (!old || !old.conversations) return old;

        const targetIndex = old.conversations.findIndex(
          (c) => c.id === conversationId || c.ticketId === conversationId,
        );

        if (targetIndex === -1) return old;

        console.log(
          `[Frontend] ✅ Found conv in cache at index ${targetIndex}, updating...`,
        );

        const updatedConv = {
          ...old.conversations[targetIndex],
          typingStatus: status === "paused" ? undefined : status,
        };

        const newConvs = [...old.conversations];
        newConvs[targetIndex] = updatedConv;

        return {
          ...old,
          conversations: newConvs,
        };
      },
    );
  };

  return {
    // Could expose socket connection status here if needed
    isConnected: socketService.isConnected,
  };
};
