/**
 * 🔄 CONVERSATION SYNC HOOK (Refactored for Consistency)
 *
 * Real-time synchronization of conversations via Socket.IO
 * Updates the shared CHAT_KEYS cache used by the Sidebar.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socketService } from "../../services/socketService";
import { type Conversation } from "../../services/chatService";
import { CHAT_KEYS } from "./useChat";
import { Logger } from "../utils/logger";

interface ConversationCreatedPayload {
  conversation: Conversation;
  timestamp: string;
}

interface ConversationUpdatedPayload {
  conversation: Partial<Conversation> & { ticketId: string; id: string };
  timestamp: string;
}

export function useConversationSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    /**
     * Handle conversation.created event
     * Adds new conversation to cache WITHOUT fetching from server
     */
    const handleConversationCreated = (
      payload: ConversationCreatedPayload,
    ): void => {
      Logger.info(
        "[useConversationSync] 🆕 Received conversation.created:",
        payload.conversation.ticketId,
      );

      queryClient.setQueryData<{
        conversations: Conversation[];
        total: number;
      }>(
        CHAT_KEYS.conversations(), // Update the "ALL" list (undefined status)
        (old) => {
          if (!old) return old;

          const existing = old.conversations || [];

          // 🛡️ DEDUPLICATION: Check if already exists by TicketID
          const alreadyExists = existing.some(
            (conv) => conv.ticketId === payload.conversation.ticketId,
          );

          if (alreadyExists) {
            Logger.warn(
              "[useConversationSync] ⚠️ Conversation already exists (ignoring duplicate):",
              payload.conversation.ticketId,
            );
            return old;
          }

          // Add to start of list (most recent first)
          Logger.info(
            "[useConversationSync] ✅ Added new conversation to cache:",
            payload.conversation.ticketId,
          );

          return {
            ...old,
            conversations: [payload.conversation, ...existing],
            total: old.total + 1,
          };
        },
      );
    };

    /**
     * Handle conversation.updated event
     * Updates existing conversation in metadata (last message, status, etc)
     */
    const handleConversationUpdated = (
      payload: ConversationUpdatedPayload,
    ): void => {
      // Logic handled via invalidation in useChatSockets usually,
      // but we can do optimistic update here if payload is complete.
      // For now, let's keep it simple or rely on the invalidation from useChatSockets if active.
      // BUT: useChatSockets invalidates. If we want this to be the 100-Year solution, we should update cache.

      const ticketId = payload.conversation.ticketId || payload.conversation.id; // Fallback

      queryClient.setQueryData<{
        conversations: Conversation[];
        total: number;
      }>(CHAT_KEYS.conversations(), (old) => {
        if (!old) return old;

        const updatedList = old.conversations.map((conv) => {
          if (conv.ticketId === ticketId || conv.id === ticketId) {
            return { ...conv, ...payload.conversation };
          }
          return conv;
        });

        // Re-sort? Usually strictly time based.

        return { ...old, conversations: updatedList };
      });
    };

    // ✅ Subscribe to socket events
    Logger.info("[useConversationSync] 🔌 Subscribing to real-time events");

    // Only handle CREATED here to prevent duplicates.
    // Updated/Closed/Message are handled by useChatSockets or can be migrated here fully later.
    // For now, the CRITICAL issue is duplications on CREATED.

    socketService.on("conversation.created", handleConversationCreated);

    // We can also listen to specific updates if needed, but let's avoid conflict with useChatSockets
    // which seems to handle message.received -> conversation update.

    // Cleanup
    return () => {
      socketService.off("conversation.created", handleConversationCreated);
    };
  }, [queryClient]);
}
