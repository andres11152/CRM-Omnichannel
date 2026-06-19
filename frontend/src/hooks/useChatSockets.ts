import { useEffect } from "react";
import { useQueryClient, QueryClient } from "@tanstack/react-query";
import { socketService } from "@/services/socketService";
import { Logger } from "@/utils/logger";
import { Message, Conversation, Ticket, SenderType } from "@/types";
import {
  addMessageToCache,
  updateConversationInCache,
  CHAT_KEYS,
} from "./useChat";

//  STRICT SOCKET TYPES
interface RawSocketMessage {
  id: string;
  content: string;
  createdAt?: string | Date;
  timestamp?: string | Date;
  direction?: "INBOUND" | "OUTBOUND";
  senderId?: string;
  type?: "text" | "image" | "video" | "audio" | "document";
  mediaType?: string;
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
  ticketId?: string;
  id?: string;
  conversation?: Partial<Conversation>;
  updates?: Partial<Conversation>;
}

/**
 * CUSTOM HOOK: useChatSockets
 * Integrates-ESocket.IO real-time events with React Query cache
 */
export const useChatSockets = (currentTicketId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleMessageReceived = (payload: SocketMessagePayload) => {
      const rawMsg = payload.message;
      
      // Resolve the message type from socket payload (mediaType → metadata.media.type → type → "text")
      const socketMediaType = rawMsg.mediaType || (rawMsg.metadata as Record<string, unknown> | undefined)?.media && ((rawMsg.metadata as Record<string, unknown>).media as Record<string, unknown>)?.type;
      const resolvedType = socketMediaType
        ? String(socketMediaType).toLowerCase()
        : (rawMsg.type || "text");

      const normalizedMessage: Message = {
        ...rawMsg,
        ticketId: payload.ticketId,
        companyId: (rawMsg.companyId as string) || "",
        senderType: (rawMsg.senderType as SenderType) || (rawMsg.direction === "OUTBOUND" ? SenderType.AGENT : SenderType.USER),
        type: resolvedType,
        mediaUrl: (rawMsg.mediaUrl as string) || ((rawMsg.metadata as Record<string, unknown>)?.media as Record<string, unknown> | undefined)?.url as string | undefined,
        timestamp: rawMsg.createdAt
          ? new Date(rawMsg.createdAt).toISOString()
          : typeof rawMsg.timestamp === "string"
            ? rawMsg.timestamp
            : new Date(rawMsg.timestamp || Date.now()).toISOString(),
        sender: rawMsg.direction === "OUTBOUND" ? "agent" : "customer",
      };

      const actualConversationId = payload.ticketId || payload.conversation?.id || currentTicketId;
      if (!actualConversationId) {
        Logger.warn("[useChatSockets] Missing conversation/ticket ID in payload");
        return;
      }

      addMessageToCache(queryClient, actualConversationId, normalizedMessage);

      if (payload.conversation) {
        updateConversationInCache(queryClient, actualConversationId, {
          lastMessage: payload.message.content,
          lastMessageAt: payload.message.timestamp
            ? new Date(payload.message.timestamp).toISOString()
            : new Date().toISOString(),
          unreadCount: payload.conversation.unreadCount || 0,
        });
      }

      // [PERF] REMOVED: invalidateQueries was causing race conditions.
      // Socket already provides complete data via optimistic cache updates above.
      // Refetching here overwrites optimistic data with stale server state,
      // causing tickets to appear then vanish from the queue.
    };

    const handleConversationUpdated = (payload: SocketConversationPayload) => {
      const convId = payload.id || payload.ticketId || payload.conversation?.id;
      if (!convId) return;
      
      // Handle both { updates } wrappers and flat payloads
      const updates = payload.updates || payload.conversation || payload as Partial<Conversation>;
      
      updateConversationInCache(queryClient, convId, updates);
      // [PERF] REMOVED: invalidateQueries — cache already updated above
    };

    const handleTicketDeleted = (payload: { ticketId: string }) => {
      // Remove messages from cache directly (no refetch needed)
      queryClient.removeQueries({
        queryKey: CHAT_KEYS.messages(payload.ticketId),
      });
      // Remove conversation from cache optimistically
      queryClient.setQueryData<{
        conversations: Conversation[];
        total: number;
      }>(CHAT_KEYS.conversations(), (old) => {
        if (!old) return old;
        const filtered = old.conversations.filter(
          (c) => c.ticketId !== payload.ticketId && c.id !== payload.ticketId,
        );
        return { ...old, conversations: filtered, total: filtered.length };
      });
    };

    const handleMessageStatus = (payload: {
      ticketId?: string;
      conversationId?: string;
      messageId: string;
      status: "sent" | "delivered" | "read";
    }) => {
      const actualConversationId = payload.ticketId || payload.conversationId;
      if (!actualConversationId) return;

      queryClient.setQueryData<Message[]>(
        CHAT_KEYS.messages(actualConversationId),
        (old = []) =>
          old.map((msg) =>
            msg.id === payload.messageId
              ? { ...msg, status: payload.status }
              : msg,
          ),
      );
    };

    // [PERF] ticket.created, conversation.created, conversation.closed:
    // These events are already handled by useConversationSync (created)
    // and useAgentWorkspaceSockets (updated/closed). No refetch needed.
    const handleTicketCreated = () => {
      // Handled by useAgentWorkspaceSockets via ticket.updated
    };

    const handleConversationCreated = () => {
      // Handled by useConversationSync which does optimistic cache update
    };

    const handleConversationClosed = () => {
      // Handled by useAgentWorkspaceSockets via ticket.updated (status change)
    };

    const handleConversationTyping = (payload: {
      conversationId: string;
      from: string;
      status: string;
    }) => {
      const activeStatus = (payload.status === "composing" || payload.status === "recording") 
        ? payload.status 
        : "paused";

      updateConversationTypingStatus(
        queryClient,
        payload.conversationId,
        activeStatus as "composing" | "recording" | "paused",
      );

      if (activeStatus !== "paused") {
        setTimeout(() => {
          updateConversationTypingStatus(
            queryClient,
            payload.conversationId,
            "paused",
          );
        }, 6000);
      }
    };

    const handleMessageReaction = (payload: {
      messageId: string;
      conversationId: string;
      reaction: string;
      participant: string;
    }) => {
      const ticketId = payload.conversationId || currentTicketId;
      if (!ticketId) return;

      queryClient.setQueryData<Message[]>(
        CHAT_KEYS.messages(ticketId),
        (old = []) =>
          old.map((msg) => {
            if (msg.id !== payload.messageId) return msg;
            const currentReactions = msg.reactions || [];
            let newReactions = [...currentReactions];
            if (!payload.reaction) {
              newReactions = newReactions.filter(
                (r) => r.reactBy !== payload.participant,
              );
            } else {
              const idx = newReactions.findIndex(
                (r) => r.reactBy === payload.participant,
              );
              if (idx !== -1) {
                newReactions[idx] = {
                  ...newReactions[idx],
                  content: payload.reaction,
                };
              } else {
                newReactions.push({
                  reactBy: payload.participant,
                  content: payload.reaction,
                });
              }
            }
            return { ...msg, reactions: newReactions } as Message;
          }),
      );
    };

    const handleSyncStarted = (payload: { conversationId: string }) => {
      updateConversationInCache(queryClient, payload.conversationId, {
        // @ts-ignore - temporary UI flag
        isSyncing: true
      });
    };

    const handleHistorySynced = (payload: { conversationId: string }) => {
      updateConversationInCache(queryClient, payload.conversationId, {
        // @ts-ignore - temporary UI flag
        isSyncing: false
      });
      queryClient.invalidateQueries({
        queryKey: CHAT_KEYS.messages(payload.conversationId),
      });
    };

    // Subscribe to socket events
    socketService.on("message.received", handleMessageReceived);
    socketService.on("conversation.updated", handleConversationUpdated);
    socketService.on("ticket.deleted", handleTicketDeleted);
    socketService.on("message.status", handleMessageStatus);
    socketService.on("ticket.created", handleTicketCreated);
    socketService.on("conversation.closed", handleConversationClosed);
    socketService.on("conversation:typing", handleConversationTyping);
    socketService.on("message.reaction", handleMessageReaction);
    socketService.on("sync:started", handleSyncStarted);
    socketService.on("conversation:history_synced", handleHistorySynced);

    // Cleanup on unmount
    return () => {
      socketService.off("message.received", handleMessageReceived);
      socketService.off("conversation.updated", handleConversationUpdated);
      socketService.off("ticket.deleted", handleTicketDeleted);
      socketService.off("message.status", handleMessageStatus);
      socketService.off("ticket.created", handleTicketCreated);
      socketService.off("conversation.closed", handleConversationClosed);
      socketService.off("conversation:typing", handleConversationTyping);
      socketService.off("message.reaction", handleMessageReaction);
      socketService.off("sync:started", handleSyncStarted);
      socketService.off("conversation:history_synced", handleHistorySynced);
    };
  }, [queryClient, currentTicketId]);


  const updateConversationTypingStatus = (
    queryClient: QueryClient,
    conversationId: string,
    status: "composing" | "recording" | "paused",
  ) => {
    Logger.info(`[useChatSockets] [ONLINE] Updating Typing Status: ${status} for Conv ${conversationId}`);

    queryClient.setQueriesData<{
      conversations: Conversation[];
      total: number;
    }>(
      { queryKey: ["conversations"] }, 
      (old) => {
        if (!old || !old.conversations) return old;

        const targetIndex = old.conversations.findIndex(
          (c) => c.id === conversationId || c.ticketId === conversationId,
        );

        if (targetIndex === -1) return old;

        Logger.info(`[useChatSockets] [OK] Found conv in cache, updating typing status...`);

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
    isConnected: socketService.isConnected,
  };
};
