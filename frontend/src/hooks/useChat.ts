import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Message, Conversation, SenderType } from "@/types";
import {
  chatService,
  type SendMessageInput,
} from "@/services/chatService";
import { jwtDecode } from "jwt-decode";

// Cache token decoding for performance
let cachedUserId: string | null = null;
const getCurrentUserId = () => {
  if (cachedUserId) return cachedUserId;
  try {
    const token = localStorage.getItem("token");
    if (token) {
      cachedUserId = (jwtDecode<{ id: string }>(token)).id;
      return cachedUserId;
    }
  } catch {
    // malformed/expired token — falls through to the "me" fallback below
  }
  return "me"; // fallback
};

/**
 * QUERY KEYS
 * Centralized query keys for chat-related queries
 */
export const CHAT_KEYS = {
  conversations: (status?: string) => ["conversations", status] as const,
  messages: (ticketId: string) => ["messages", ticketId] as const,
};

/**
 * CUSTOM HOOK: useConversations
 * Fetches and manages conversation list
 */
export const useConversations = (status?: "open" | "pending" | "resolved") => {
  return useQuery({
    queryKey: CHAT_KEYS.conversations(status),
    queryFn: () => chatService.getConversations({ status }),
    staleTime: 1000 * 30, // 30 seconds - conversations change frequently
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

const sortByTimestamp = (msgs: Message[]): Message[] =>
  [...msgs].sort(
    (a, b) =>
      new Date(String(a.timestamp)).getTime() - new Date(String(b.timestamp)).getTime(),
  );

/**
 * CUSTOM HOOK: useMessages
 * Fetches and manages message history for a conversation.
 * Merges API result with any socket messages already in cache (race-condition guard).
 */
export const useMessages = (ticketId: string | null) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ticketId ? CHAT_KEYS.messages(ticketId) : ["messages", "null"],
    queryFn: async () => {
      if (!ticketId) return [];
      const apiMessages = await chatService.getMessages(ticketId);
      // Preserve socket messages that arrived while this fetch was in flight
      const cached =
        queryClient.getQueryData<Message[]>(CHAT_KEYS.messages(ticketId)) ?? [];
      const socketOnly = cached.filter(
        (m) =>
          !String(m.id).startsWith("temp-") &&
          !apiMessages.some((api) => api.id === m.id),
      );
      return sortByTimestamp([...apiMessages, ...socketOnly]);
    },
    enabled: !!ticketId,
    // History is kept fresh by sockets while a chat is open, so we don't poll.
    staleTime: Infinity,
    gcTime: 1000 * 60 * 10,
    // [FIX] Always reload history from the server when a chat is (re)opened.
    // Without this, a single failed initial load (e.g. a transient backend/Redis
    // hiccup) would stick forever under `staleTime: Infinity`, leaving the chat
    // showing only socket messages and never recovering until a hard refresh.
    refetchOnMount: "always",
    refetchOnReconnect: true,
    // Recover from transient failures (slow Redis, network blips) with backoff
    // instead of giving up on the first error.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
};

/**
 * CUSTOM HOOK: useSendMessage
 * Handles sending messages with optimistic updates
 */
export const useSendMessage = (ticketId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      chatService.sendMessage(ticketId, input),

    // 1. OPTIMISTIC UPDATE (Before API call)
    onMutate: async (newMessage: SendMessageInput) => {
      const startTime = performance.now();

      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: CHAT_KEYS.messages(ticketId),
      });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<Message[]>(
        CHAT_KEYS.messages(ticketId),
      );

      // Generate consistent ID for deterministic reconciliation
      const tempId = `temp-${Date.now()}`;

      // Inject tempId into metadata for backend to echo back
      newMessage.metadata = { ...newMessage.metadata, tempId };

      // Optimistically update cache with temporary message
      const optimisticMessage: Message = {
        id: tempId,
        ticketId,
        companyId: "",
        senderType: SenderType.AGENT,
        content: newMessage.content,
        type: newMessage.type || "text",
        sender: "agent",
        timestamp: new Date().toISOString(),
        status: "sending",
        mediaUrl: newMessage.mediaUrl,
        metadata: newMessage.metadata,
      };

      console.log(` [onMutate] Creating optimistic message:`, {
        tempId,
        content: newMessage.content.substring(0, 20),
        time: `${(performance.now() - startTime).toFixed(2)}ms`,
      });

      queryClient.setQueryData<Message[]>(
        CHAT_KEYS.messages(ticketId),
        (old = []) => [...old, optimisticMessage],
      );

      // Return context for rollback
      return { previousMessages, tempId };
    },

    // 2. SUCCESS (API call succeeded)
    //  100-YEAR FIX: Atomic reconciliation with race condition protection
    onSuccess: (serverMessage: Message, _variables, context) => {
      const reconcileStart = performance.now();
      console.log(`[OK] [onSuccess] API responded:`, {
        serverMsgId: serverMessage.id,
        tempId: context?.tempId,
        serverTempId: serverMessage.metadata?.tempId,
      });

      queryClient.setQueryData<Message[]>(
        CHAT_KEYS.messages(ticketId),
        (old = []) => {
          console.log(`[STAT] [onSuccess] Cache state:`, {
            total: old.length,
            temps: old.filter((m) => m.id.startsWith("temp-")).length,
            hasServerMsg: old.some((m) => m.id === serverMessage.id),
          });

          // 1. Check if Socket.IO already reconciled this message
          const serverMsgExists = old.some((m) => m.id === serverMessage.id);
          if (serverMsgExists) {
            // Socket beat us to it - just clean up any remaining temp messages
            console.log(
              `[SYNC] [onSuccess] Socket won race, cleaning temps (${(performance.now() - reconcileStart).toFixed(2)}ms)`,
            );
            return old.filter((m) => !m.id.startsWith("temp-"));
          }

          // 2. Find optimistic message by tempId (most accurate)
          const tempIdFromServer = serverMessage.metadata?.tempId;
          let targetIndex = -1;

          if (tempIdFromServer) {
            targetIndex = old.findIndex(
              (m) =>
                m.id.startsWith("temp-") &&
                m.metadata?.tempId === tempIdFromServer,
            );
          }

          // 3. Fallback: Find by temp- prefix if only one exists
          if (targetIndex === -1) {
            const tempMessages = old.filter((m) => m.id.startsWith("temp-"));
            if (tempMessages.length === 1) {
              targetIndex = old.findIndex((m) => m.id === tempMessages[0].id);
            }
          }

          // 4. ATOMIC REPLACEMENT: Replace temp message in-place (prevents re-render flash)
          if (targetIndex !== -1) {
            console.log(
              ` [onSuccess] Replacing temp at index ${targetIndex} (${(performance.now() - reconcileStart).toFixed(2)}ms)`,
            );
            const updated = [...old];
            updated[targetIndex] = serverMessage;
            return updated;
          }

          // 5. Fallback: Append if no temp found (edge case)
          console.warn(
            `[WARNING] [onSuccess] No temp found, appending (${(performance.now() - reconcileStart).toFixed(2)}ms)`,
          );
          return [
            ...old.filter((m) => !m.id.startsWith("temp-")),
            serverMessage,
          ];
        },
      );

      // Update conversations list (last message changed)
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
    },

    // 3. ERROR (API call failed)
    onError: (error: unknown, _newMessage, context) => {
      // Rollback to previous state
      if (context?.previousMessages) {
        queryClient.setQueryData(
          CHAT_KEYS.messages(ticketId),
          context.previousMessages,
        );
      }

      console.error("[useSendMessage] Error:", error);
      toast.error(t("use_chat.toast.send_error", "Error al enviar mensaje"));
    },

    // 4. SETTLED (Always runs after success or error)
    //  DO NOT invalidate messages here!
    // The onSuccess already handles reconciliation properly.
    // Invalidating causes a refetch that briefly shows BOTH temp and server message.
    onSettled: () => {
      // Only invalidate conversations (needed for last message preview update)
      // Messages are already correctly updated in onSuccess via setQueryData
    },
  });
};

/**
 * HELPER: Add Message to Cache (for Socket integration)
 * Manually adds a received message to the cache
 */
export const addMessageToCache = (
  queryClient: QueryClient,
  ticketId: string,
  message: Message,
) => {
  const socketStart = performance.now();
  console.log(`[WS] [Socket.IO] Message received:`, {
    msgId: message.id,
    tempId: message.metadata?.tempId,
    content: message.content.substring(0, 20),
  });

  queryClient.setQueryData<Message[]>(
    CHAT_KEYS.messages(ticketId),
    (old = []) => {
      console.log(`[STAT] [Socket.IO] Cache state:`, {
        total: old.length,
        temps: old.filter((m) => m.id && String(m.id).startsWith("temp")).length,
        hasMsg: old.some((m) => m.id === message.id),
      });

      // [SEC] CRITICAL: Early deduplication check (prevents flashback)
      // If message already exists, check if status, content, or metadata changed before skipping.
      const existingIdx = old.findIndex((m) => m.id === message.id);
      if (existingIdx !== -1) {
        const existing = old[existingIdx];
        const statusChanged = existing.status?.toLowerCase() !== message.status?.toLowerCase();
        const contentChanged = existing.content !== message.content;
        const metaChanged = JSON.stringify(existing.metadata) !== JSON.stringify(message.metadata);

        if (statusChanged || contentChanged || metaChanged) {
          console.log(
            ` [Socket.IO] Updating existing message in-place: ${message.id}`,
            { oldStatus: existing.status, newStatus: message.status }
          );
          const updated = [...old];
          updated[existingIdx] = {
            ...existing,
            ...message,
            status: message.status,
          };
          return updated;
        }

        console.log(
          `[SKIP] [Socket.IO] Already exists and identical, skipping (${(performance.now() - socketStart).toFixed(2)}ms)`,
        );
        return old; // No change = no re-render
      }

      // 2. Deterministic Reconciliation (Metadata tempId check) -  100% ACCURACY
      const tempIdMatchIndex = old.findIndex(
        (m) =>
          m.id &&
          String(m.id).startsWith("temp") &&
          message.metadata?.tempId &&
          m.metadata?.tempId === message.metadata.tempId,
      );

      if (tempIdMatchIndex !== -1) {
        console.log(
          ` [Socket.IO] Deterministic match at ${tempIdMatchIndex}: ${old[tempIdMatchIndex].id} -> ${message.id} (${(performance.now() - socketStart).toFixed(2)}ms)`,
        );
        const updated = [...old];
        updated[tempIdMatchIndex] = message;
        return updated;
      }

      // 3. Fuzzy Reconciliation (Fallback for older clients or if metadata stripped)
      const now = new Date().getTime();
      const fuzzyMatchIndex = old.findIndex(
        (m) =>
          m.id &&
          String(m.id).startsWith("temp") &&
          m.content?.trim() === message.content?.trim() &&
          now - new Date(m.timestamp).getTime() < 10000,
      );

      if (fuzzyMatchIndex !== -1) {
        console.log(
          `[SYNC] [Socket.IO] Fuzzy match at ${fuzzyMatchIndex} (${(performance.now() - socketStart).toFixed(2)}ms)`,
        );
        const updated = [...old];
        updated[fuzzyMatchIndex] = message;
        return updated;
      }

      // 4. Normal Append (new message from other user or no temp found)
      console.log(
        ` [Socket.IO] New message, appending (${(performance.now() - socketStart).toFixed(2)}ms)`,
      );
      return sortByTimestamp([...old, message]);
    },
  );
};

/**
 * CUSTOM HOOK: useResolveTicket
 * Handles ticket resolution
 */
export const useResolveTicket = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      ticketId,
      resolutionType,
      notes,
    }: {
      ticketId: string;
      resolutionType: "sales" | "support" | "admin" | "other" | "spam";
      notes?: string;
    }) => chatService.resolveTicket(ticketId, { resolutionType, notes }),

    onSuccess: (_, { ticketId }) => {
      toast.success(t("use_chat.toast.ticket_resolved", "Ticket resuelto"));

      // Invalidate conversations to update status
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });

      // Invalidate messages to show resolution system message
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
    },

    onError: (error: unknown) => {
      console.error("[useResolveTicket] Error:", error);
      // Error toast handled by apiClient
    },
  });
};

/**
 * CUSTOM HOOK: useDeleteTicket
 * Handles ticket deletion
 */
export const useDeleteTicket = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (ticketId: string) => chatService.deleteTicket(ticketId),

    onSuccess: (_, ticketId) => {
      toast.success(t("use_chat.toast.ticket_deleted", "Ticket eliminado"));

      // Remove from conversations list
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });

      // Remove messages from cache
      queryClient.removeQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
    },

    onError: (error: unknown) => {
      console.error("[useDeleteTicket] Error:", error);
    },
  });
};

/**
 * CUSTOM HOOK: useReactToMessage
 * Handles reacting to a message with an emoji
 */
export const useReactToMessage = (ticketId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ messageId, reaction }: { messageId: string; reaction: string }) =>
      chatService.reactToMessage(ticketId, messageId, reaction),
    
    onMutate: async ({ messageId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
      const previousMessages = queryClient.getQueryData<Message[]>(CHAT_KEYS.messages(ticketId));

      queryClient.setQueryData<Message[]>(CHAT_KEYS.messages(ticketId), (old = []) => 
        old.map(m => {
          if (m.id !== messageId) return m;
          
          const existingReactions = m.reactions || [];
          
          // WHATSAPP BEHAVIOR: EXPLICIT REMOVAL
          const currentUserId = getCurrentUserId();
          if (reaction === "") {
             const baseReacts = existingReactions.filter(r => r.reactBy !== 'me' && !r.isMe && r.reactBy !== currentUserId);
             return { ...m, reactions: baseReacts };
          }
          
          // OTHERWISE: REPLACE EXISTING WITH NEW EMOJI
          const otherReactsFromMe = existingReactions.filter(r => r.reactBy === 'me' || r.isMe || r.reactBy === currentUserId);
          const baseReacts = existingReactions.filter(r => !otherReactsFromMe.includes(r));
          
          return {
            ...m,
            reactions: [...baseReacts, { content: reaction, reactBy: 'me', isMe: true }]
          };
        })
      );

      return { previousMessages };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(CHAT_KEYS.messages(ticketId), context.previousMessages);
      }
      toast.error(t("use_chat.toast.react_error", "Error al reaccionar"));
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
    }
  });
};

/**
 * CUSTOM HOOK: useEditMessage
 * Edits an already-sent outbound message's content
 */
export const useEditMessage = (ticketId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      chatService.editMessage(ticketId, messageId, content),

    onMutate: async ({ messageId, content }) => {
      await queryClient.cancelQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
      const previousMessages = queryClient.getQueryData<Message[]>(CHAT_KEYS.messages(ticketId));

      queryClient.setQueryData<Message[]>(CHAT_KEYS.messages(ticketId), (old = []) =>
        old.map((m) => (m.id === messageId ? { ...m, content } : m)),
      );

      return { previousMessages };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(CHAT_KEYS.messages(ticketId), context.previousMessages);
      }
      toast.error(t("use_chat.toast.edit_error", "Error al editar el mensaje"));
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
    },
  });
};

/**
 * CUSTOM HOOK: useRevokeMessage
 * Deletes an already-sent outbound message "for everyone"
 */
export const useRevokeMessage = (ticketId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (messageId: string) => chatService.deleteMessageForEveryone(ticketId, messageId),

    onMutate: async (messageId: string) => {
      await queryClient.cancelQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
      const previousMessages = queryClient.getQueryData<Message[]>(CHAT_KEYS.messages(ticketId));

      queryClient.setQueryData<Message[]>(CHAT_KEYS.messages(ticketId), (old = []) =>
        old.map((m) =>
          m.id === messageId
            ? { ...m, content: " Este mensaje fue eliminado", status: "REVOKED" as const }
            : m,
        ),
      );

      return { previousMessages };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(CHAT_KEYS.messages(ticketId), context.previousMessages);
      }
      toast.error(t("use_chat.toast.revoke_error", "Error al eliminar el mensaje"));
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
    },
  });
};

/**
 * CUSTOM HOOK: useStarMessage
 * Toggles a message's starred state
 */
export const useStarMessage = (ticketId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ messageId, starred }: { messageId: string; starred: boolean }) =>
      chatService.setMessageStarred(ticketId, messageId, starred),

    onMutate: async ({ messageId, starred }) => {
      await queryClient.cancelQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
      const previousMessages = queryClient.getQueryData<Message[]>(CHAT_KEYS.messages(ticketId));

      queryClient.setQueryData<Message[]>(CHAT_KEYS.messages(ticketId), (old = []) =>
        old.map((m) =>
          m.id === messageId
            ? { ...m, metadata: { ...(m.metadata || {}), starred } }
            : m,
        ),
      );

      return { previousMessages };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(CHAT_KEYS.messages(ticketId), context.previousMessages);
      }
      toast.error(t("use_chat.toast.star_error", "Error al destacar el mensaje"));
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
    },
  });
};

/**
 * CUSTOM HOOK: usePinMessage
 * Pins/unpins a message "for everyone" (banner-at-top). WhatsApp keeps only
 * one pinned message per chat, so pinning a new one optimistically clears the
 * flag off any other message in the cache.
 */
export const usePinMessage = (ticketId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      chatService.setMessagePinned(ticketId, messageId, pinned),

    onMutate: async ({ messageId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
      const previousMessages = queryClient.getQueryData<Message[]>(CHAT_KEYS.messages(ticketId));

      queryClient.setQueryData<Message[]>(CHAT_KEYS.messages(ticketId), (old = []) =>
        old.map((m) => {
          if (m.id === messageId) {
            return { ...m, metadata: { ...(m.metadata || {}), isPinned: pinned } };
          }
          // Enforce single-pin: clear any other pinned message when pinning a new one.
          if (pinned && (m.metadata as Record<string, unknown> | undefined)?.isPinned) {
            return { ...m, metadata: { ...(m.metadata || {}), isPinned: false } };
          }
          return m;
        }),
      );

      return { previousMessages };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(CHAT_KEYS.messages(ticketId), context.previousMessages);
      }
      toast.error(t("use_chat.toast.pin_error", "Error al fijar el mensaje"));
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
    },
  });
};

/**
 * CUSTOM HOOK: usePickNextTicket
 * Handles picking next available ticket
 */
export const usePickNextTicket = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => chatService.pickNextTicket(),

    onSuccess: (conversation) => {
      if (conversation) {
        toast.success(t("use_chat.toast.ticket_assigned", "Ticket asignado"));
        queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
      } else {
        toast.info(t("use_chat.toast.no_tickets_available", "No hay tickets disponibles"));
      }
    },

    onError: (error: unknown) => {
      console.error("[usePickNextTicket] Error:", error);
    },
  });
};

/**
 * HELPER: Update Conversation in Cache (for Socket integration)
 * Updates conversation metadata when new message arrives
 */
export const updateConversationInCache = (
  queryClient: QueryClient,
  ticketId: string,
  updates: Partial<Conversation>,
) => {
  queryClient.setQueryData<{ conversations: Conversation[]; total: number }>(
    CHAT_KEYS.conversations(),
    (old) => {
      if (!old) return old;

      // Find and update the target conversation
      const targetIndex = old.conversations.findIndex(
        (c) => c.ticketId === ticketId || c.id === ticketId,
      );

      // If not found, invalidate to fetch fresh list (safer for new tickets)
      if (targetIndex === -1) {
        queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations() });
        return old;
      }

      const updatedConv = { ...old.conversations[targetIndex], ...updates };

      // Remove original and add updated to TOP
      const otherConvs = old.conversations.filter(
        (_, idx) => idx !== targetIndex,
      );

      return {
        ...old,
        conversations: [updatedConv, ...otherConvs],
      };
    },
  );
};
