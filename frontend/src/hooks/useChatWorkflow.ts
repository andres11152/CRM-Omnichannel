import { useState, useEffect, useCallback, useRef } from "react";
import { Message, Contact, AIConfig, QuickReply, SenderType } from "@/types";
import { socketService } from "@/services/socketService";
import { chatService } from "@/services/chatService";
import { messageCacheService } from "@/services/messageCacheService";
import { analyzeSentiment } from "@/services/geminiService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMessages, useSendMessage, addMessageToCache, useReactToMessage, useEditMessage, useRevokeMessage, useStarMessage, usePinMessage, CHAT_KEYS } from "./useChat";
import { useQueryClient } from "@tanstack/react-query";
import { uploadMedia } from "@/services/mediaService";

export interface ChatWorkflowProps {
  activeContact: Contact;
  aiConfig: AIConfig;
}

// [SEC] Define internal interface for socket events to avoid dot-access errors on 'unknown'
interface ChatSocketPayload {
  ticketId?: string;
  conversationId?: string;
  message?: Record<string, unknown>;
  conversation?: {
    contact?: {
      phone?: string;
    };
  };
  [key: string]: unknown;
}

export const useChatWorkflow = ({ activeContact, aiConfig }: ChatWorkflowProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ticketId = activeContact.ticketId || ""; // [SEC] Fallback for type safety
  const { data: messages = [], isLoading: isLoadingMessages } = useMessages(ticketId);
  const sendMessageMutation = useSendMessage(ticketId);
  const reactMutation = useReactToMessage(ticketId);
  const editMessageMutation = useEditMessage(ticketId);
  const revokeMessageMutation = useRevokeMessage(ticketId);
  const starMessageMutation = useStarMessage(ticketId);
  const pinMessageMutation = usePinMessage(ticketId);

  const [isTyping, setIsTyping] = useState(false);
  const [isRemoteTyping, setIsRemoteTyping] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sentiment, setSentiment] = useState("Neutral");
  const [pinnedMessage, setPinnedMessage] = useState<{
    id: string;
    content: string;
    senderId?: string;
  } | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ────────────────────────────────────────────────
  // AUTO-SCROLL
  // ────────────────────────────────────────────────
  const scrollToBottom = useCallback((instant = false) => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ 
        behavior: instant ? "auto" : "smooth",
        block: "end"
      });
    }
  }, []);

  // Track if this is the first render for this contact
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    isFirstLoadRef.current = true;
  }, [activeContact.id]);

  useEffect(() => {
    if (messages.length > 0) {
      if (isFirstLoadRef.current) {
        scrollToBottom(true); // Instant scroll on mount
        isFirstLoadRef.current = false;
        // Small delay to account for content rendering/images
        setTimeout(() => scrollToBottom(true), 100);
      } else {
        scrollToBottom(); // Smooth scroll for new messages
      }
    }
  }, [messages, isRemoteTyping, scrollToBottom]);

  // Derive the pinned-message banner from message metadata. Must also CLEAR the
  // banner when nothing is pinned (e.g. after an optimistic unpin), so this
  // always mirrors the current messages rather than only ever setting a pin.
  useEffect(() => {
    const pinned = messages.find(
      (m) => (m.metadata as Record<string, unknown>)?.isPinned === true
    );
    if (pinned) {
      const sender = pinned.sender;
      let senderId = pinned.senderId;

      if (!senderId) {
        if (sender && typeof sender === "object") {
          senderId = sender.id;
        } else if (typeof sender === "string") {
          senderId = sender;
        }
      }

      setPinnedMessage({
        id: pinned.id,
        content: pinned.content,
        senderId,
      });
    } else {
      setPinnedMessage(null);
    }
  }, [messages]);

  // ────────────────────────────────────────────────
  // SOCKET LISTENERS
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!ticketId) return;

    // Listen for inbound messages via Socket.IO
    const handleIncomingMessage = (payload: ChatSocketPayload) => {
      // Backend emits two event shapes:
      // 1. 'message.received': { ticketId, message: {...}, conversation: {...} }
      // 2. 'conversation.new_message': { id, conversationId, content, direction, ... }
      
      // Extract the actual message object
      const rawMsg = (payload.message || payload) as Record<string, unknown>;
      const msgConversationId = (rawMsg.conversationId as string) || (payload.conversationId as string) || '';
      const payloadTicketId = (payload.ticketId as string) || '';
      const incomingPhone = payload.conversation?.contact?.phone || (rawMsg.from as string);
      
      // Extract phone numbers for comparison (normalized)
      const normalizePhone = (p?: string) => p?.replace(/\D/g, '') || '';
      const activePhone = normalizePhone(activeContact.phone);
      const payloadPhone = normalizePhone(incomingPhone);
      
      // Match against the active ticket's ID or conversation fallback
      const isForThisChat = 
        (!!payloadTicketId && payloadTicketId === ticketId) || 
        (!!msgConversationId && (msgConversationId === ticketId || msgConversationId === activeContact.id)) ||
        (!!activePhone && !!payloadPhone && activePhone === payloadPhone);
      
      if (!isForThisChat) {
        console.warn(`[Workflow] [WS] [SKIP] Skipping message.`, {
          event: payload.message ? 'message.received' : 'conversation.new_message',
          reason: 'No match found',
          ticketMatch: `${payloadTicketId} === ${ticketId}`,
          convMatch: `${msgConversationId} === ${ticketId} OR ${activeContact.id}`,
          phoneMatch: `${activePhone} === ${payloadPhone}`,
          activeContactId: activeContact.id,
          msgId: rawMsg.id
        });
        return;
      }

      console.log(`[Workflow] [WS] [OK] Message accepted for current chat! clearing typing...`);
      // Clear typing indicator when a message is actually received
      setIsRemoteTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      // Normalize the message for the React Query cache
      const mediaMeta = ((rawMsg.metadata as Record<string, unknown>)?.media as Record<string, unknown> | undefined);
      const normalizedMessage: Message = {
        id: rawMsg.id as string,
        senderId: (rawMsg.senderId as string) || undefined,
        ticketId: ticketId,
        companyId: (rawMsg.companyId as string) || '',
        senderType: (rawMsg.senderType as SenderType) || (rawMsg.direction === 'OUTBOUND' ? SenderType.AGENT : SenderType.USER),
        content: (rawMsg.content as string) || '',
        type: (rawMsg.mediaType as Message['type']) || (mediaMeta?.type as Message['type']) || (rawMsg.type as Message['type']) || 'text',
        mediaUrl: (rawMsg.mediaUrl as string) || (mediaMeta?.url as string) || undefined,
        direction: rawMsg.direction as 'INBOUND' | 'OUTBOUND' | undefined,
        timestamp: rawMsg.createdAt
          ? new Date(rawMsg.createdAt as string).toISOString()
          : new Date().toISOString(),
        sender: rawMsg.direction === 'OUTBOUND' ? 'agent' : 'customer',
        status: (rawMsg.status as Message['status']) || 'delivered',
        metadata: rawMsg.metadata as Message['metadata'],
      };

      addMessageToCache(queryClient, ticketId, normalizedMessage);
      
      // Sentiment analysis if enabled
      if (aiConfig.isActive && normalizedMessage.senderType === SenderType.USER && normalizedMessage.content) {
        analyzeSentiment(normalizedMessage.content).then(setSentiment);
      }
    };

    // Listen on BOTH events the backend emits
    socketService.on('message.received', handleIncomingMessage);
    socketService.on('conversation.new_message', handleIncomingMessage);
    // Also catch outbound echoes (messages from phone)
    socketService.on('message.sent', handleIncomingMessage);

    const handleTypingStatus = (payload: { conversationId: string; from: string; status: string }) => {
       const isMatch = 
         payload.conversationId === activeContact.id || 
         payload.conversationId === ticketId || 
         (!!activeContact.phone && !!payload.from && payload.from.includes(activeContact.phone));

       if (isMatch) {
         console.log(`[Workflow] [WS] Typing status: ${payload.status} from ${payload.from}`);
         const isTypingNow = payload.status === "composing" || payload.status === "recording";
         setIsRemoteTyping(isTypingNow);

         // Safety: Clear existing timeout
         if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

         // If they are typing, set a safety valve to clear it after 15s in case 'paused' event is missed
         if (isTypingNow) {
           typingTimeoutRef.current = setTimeout(() => {
             console.log("[Workflow] [SAFETY] Clearing stuck typing indicator (Timeout)");
             setIsRemoteTyping(false);
           }, 15000);
         }
       }
    };
    socketService.on('conversation:typing', handleTypingStatus);

    // Pin/Unpin events
    const handlePinEvent = (payload: {
      messageId: string;
      conversationId: string;
      isPinned: boolean;
      content: string;
      senderId: string;
    }) => {
      // Match against the active chat
      if (
        payload.conversationId === ticketId ||
        payload.conversationId === activeContact.id
      ) {
        if (payload.isPinned) {
          setPinnedMessage({
            id: payload.messageId,
            content: payload.content,
            senderId: payload.senderId,
          });
        } else {
          // [SEC] 100-YEAR FIX: Clear pinned message if ANY message is unpinned in this conversation.
          // WhatsApp only supports one pinned message, so an unpin event is effectively a conversation-wide clear.
          setPinnedMessage(null);
        }
      }
    };
    socketService.on('message.pinned', handlePinEvent);

    // Message Deleted event (removes scheduled placeholders in real-time)
    const handleMessageDeleted = (payload: { messageId: string; conversationId: string }) => {
      if (
        payload.conversationId === ticketId ||
        payload.conversationId === activeContact.id
      ) {
        console.log(`[Workflow] [WS] Message deleted: ${payload.messageId}`);
        queryClient.setQueryData<Message[]>(
          CHAT_KEYS.messages(ticketId),
          (old = []) => old.filter((m) => m.id !== payload.messageId),
        );
      }
    };
    socketService.on('message.deleted', handleMessageDeleted);

    // [HISTORY SYNC] When the backend finishes backfilling history (on-demand auto-sync
    // via contextSync OR late-arriving manual sync batches via messaging-history.set), it
    // emits conversation:history_synced. Without this listener the messages were written to
    // the DB but the open chat never refreshed — so it looked like sync "did nothing".
    const handleHistorySynced = (payload: {
      conversationId?: string;
      channelId?: string;
      newMessages?: number;
      failed?: boolean;
      failureReason?: string;
    }) => {
      const matches =
        payload.conversationId === ticketId ||
        payload.conversationId === activeContact.id ||
        payload.channelId === activeContact.phone?.replace(/\D/g, "");
      if (!matches) return;
      console.log(`[Workflow] [WS] History synced (${payload.newMessages ?? "?"} msgs, failed=${payload.failed ?? false}) — refreshing chat`);
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.messages(ticketId) });
      if (payload.newMessages && payload.newMessages > 0) {
        toast.success(t("use_chat_workflow.toast.history_imported", "{{count}} mensajes del historial importados", { count: payload.newMessages }));
      } else if (payload.failed) {
        // Distinguish "we tried and genuinely found nothing" (silent, the
        // common case) from "we couldn't even try" (worth telling the agent
        // why older messages aren't showing up).
        const reasonKey = payload.failureReason === "no_connected_session"
          ? "use_chat_workflow.toast.sync_failed_no_session"
          : "use_chat_workflow.toast.sync_failed_generic";
        const reasonDefault = payload.failureReason === "no_connected_session"
          ? "No pudimos cargar más historial: WhatsApp no está conectado ahora mismo"
          : "No pudimos cargar más historial. Intenta de nuevo en un momento";
        toast.info(t(reasonKey, reasonDefault));
      }
    };
    socketService.on('conversation:history_synced', handleHistorySynced);

    // Message Status event (e.g. QUEUED -> SENT / DELIVERED / READ / FAILED)
    const handleStatusEvent = (payload: {
      messageId: string;
      conversationId?: string;
      ticketId?: string;
      status: Message["status"];
    }) => {
      const isMatch =
        payload.ticketId === ticketId ||
        payload.conversationId === ticketId ||
        payload.conversationId === activeContact.id ||
        payload.conversationId === activeContact.realContactId;

      console.log(`[Workflow] [WS] Message status update received for ${payload.messageId} -> ${payload.status} (match: ${!!isMatch})`);

      // Always try updating the current ticket cache if matched OR by searching cache items
      queryClient.setQueryData<Message[]>(
        CHAT_KEYS.messages(ticketId),
        (old = []) =>
          old.map((m) =>
            m.id === payload.messageId || (m.metadata?.dbId && m.metadata.dbId === payload.messageId)
              ? { ...m, status: payload.status }
              : m,
          ),
      );
    };
    socketService.on("message.status", handleStatusEvent);

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socketService.off('message.received', handleIncomingMessage);
      socketService.off('conversation.new_message', handleIncomingMessage);
      socketService.off('message.sent', handleIncomingMessage);
      socketService.off('conversation:typing', handleTypingStatus);
      socketService.off('message.pinned', handlePinEvent);
      socketService.off('message.deleted', handleMessageDeleted);
      socketService.off('conversation:history_synced', handleHistorySynced);
      socketService.off('message.status', handleStatusEvent);
    };
  }, [ticketId, activeContact.id, activeContact.phone, queryClient, aiConfig.isActive]);

  // ────────────────────────────────────────────────
  // ACTIONS
  // ────────────────────────────────────────────────
  /**
   * Sends a message with optional media (File upload or pre-built attachment).
   * @param directAttachment - Pre-built attachment for already-uploaded media (e.g. product images).
   *                           Bypasses the upload flow since the URL already exists on the server.
   */
  const handleSendMessage = async (
    content: string,
    mediaFile?: File | null,
    replyingTo?: Message | null,
    scheduledAt?: string | Date,
    directAttachment?: { url: string; type: "image" | "video" | "audio" | "document" | "location" | "contact"; name: string; mimetype: string; [key: string]: unknown },
    isWhisper?: boolean,
  ) => {
    if (!content.trim() && !mediaFile && !directAttachment) return;

    try {
      setIsTyping(true);

      let mediaUrl: string | undefined;
      let detectedType: "text" | "image" | "audio" | "video" | "document" | "location" | "contact" = "text";
      let attachment: { url: string; type: string; name: string; mimetype: string; [key: string]: unknown } | undefined;

      // Priority 1: Direct attachment (product images, already uploaded)
      if (directAttachment) {
        mediaUrl = directAttachment.url;
        detectedType = directAttachment.type;
        attachment = directAttachment;
        console.log(`[Workflow] Direct attachment:`, { url: mediaUrl, type: detectedType });
      }
      // Priority 2: File upload (user selected a file from disk)
      else if (mediaFile) {
        try {
          const uploaded = await uploadMedia({ file: mediaFile });
          mediaUrl = uploaded.url;
          
          const mime = mediaFile.type.toLowerCase();
          if (mime.startsWith("image/")) detectedType = "image";
          else if (mime.startsWith("audio/") || mediaFile.name.endsWith(".webm") || mediaFile.name.endsWith(".ogg") || mediaFile.name.endsWith(".mp3")) detectedType = "audio";
          else if (mime.startsWith("video/")) detectedType = "video";
          else detectedType = "document";

          attachment = {
            url: mediaUrl,
            type: detectedType,
            name: mediaFile.name || "Adjunto",
            mimetype: mediaFile.type || "application/octet-stream"
          };
          console.log(`[Workflow] Media uploaded:`, { url: mediaUrl, type: detectedType });
        } catch (uploadErr) {
          console.error("[Workflow] Upload failed:", uploadErr);
          toast.error(t("use_chat_workflow.toast.file_upload_error", "Error al subir archivo"));
          setIsTyping(false);
          return;
        }
      }

      const payload = {
        content,
        type: detectedType,
        mediaUrl,
        attachment,
        quotedMessageId: replyingTo?.id,
        quotedContent: replyingTo?.content,
        scheduledAt,
        metadata: {
          quotedMessageId: replyingTo?.id,
          quotedContent: replyingTo?.content,
          tempId: `temp-${Date.now()}`,
          isWhisper: isWhisper || undefined,
        }
      };

      await sendMessageMutation.mutateAsync(payload);
      
      if (scheduledAt) {
        toast.success(t("use_chat_workflow.toast.message_scheduled", "Mensaje programado"));
      }

      setIsTyping(false);
    } catch (err) {
      setIsTyping(false);
      console.error("[Workflow] Send error:", err);
    }
  };

  const syncHistory = async () => {
    if (!ticketId || isSyncing) return;
    
    try {
      setIsSyncing(true);
      const loadingToast = toast.loading(t("use_chat_workflow.toast.syncing_history", "Sincronizando historial…"));
      
      const result = await chatService.syncFullHistory(ticketId);

      // Invalidate query to refresh messages
      await queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });

      toast.dismiss(loadingToast);
      if (result.newMessages > 0) {
        toast.success(t("use_chat_workflow.toast.messages_imported", "{{count}} mensajes importados", { count: result.newMessages }));
      } else if (result.pending) {
        // The request reached the phone but its batch hadn't landed at response time
        // (a locked phone routinely takes >8s). The backend keeps waiting in background
        // and conversation:history_synced (handled above) refreshes the chat when it lands.
        toast.info(t("use_chat_workflow.toast.sync_pending", "Solicitud enviada al teléfono — los mensajes aparecerán automáticamente en unos segundos"));
      } else {
        // Be honest: nothing was available synchronously.
        toast.info(t("use_chat_workflow.toast.no_new_messages", "No hay mensajes nuevos por ahora"));
      }
    } catch (err) {
      console.error("[Workflow] Sync error:", err);
      toast.error(t("use_chat_workflow.toast.sync_error", "Error al sincronizar"));
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    messages,
    isLoadingMessages,
    isTyping,
    setIsTyping,
    isRemoteTyping,
    isSyncing,
    sentiment,
    pinnedMessage,
    chatEndRef,
    handleSendMessage,
    syncHistory,
    scrollToBottom,
    emitTyping: (status: "composing" | "recording" | "paused") => {
      if (!ticketId && !activeContact.id) return;
      const toId = activeContact.id || activeContact.ticketId || activeContact.phone;
      if (toId) {
        socketService.emit("conversation:typing", {
          to: toId,
          status
        });
      }
    },
    handleReact: async (messageId: string, reaction: string) => {
      try {
        await reactMutation.mutateAsync({ messageId, reaction });
      } catch (err) {
        // El onError de la mutación ya revierte el optimistic update y muestra
        // el toast; solo evitamos que el rechazo quede sin capturar (unhandled
        // promise rejection) ya que MessageBubble no espera esta promesa.
        console.error("[Workflow] React error:", err);
      }
    },
    handleEditMessage: async (messageId: string, content: string) => {
      try {
        await editMessageMutation.mutateAsync({ messageId, content });
        toast.success(t("use_chat_workflow.toast.message_edited", "Mensaje editado"));
      } catch (err) {
        console.error("[Workflow] Edit error:", err);
      }
    },
    handleDeleteMessage: async (messageId: string) => {
      try {
        await revokeMessageMutation.mutateAsync(messageId);
        toast.success(t("use_chat_workflow.toast.message_deleted", "Mensaje eliminado"));
      } catch (err) {
        console.error("[Workflow] Revoke error:", err);
      }
    },
    handleShareLocation: () => {
      if (!navigator.geolocation) {
        toast.error(t("use_chat_workflow.toast.geolocation_unsupported", "Este navegador no soporta compartir ubicación"));
        return;
      }
      const loadingToast = toast.loading(t("use_chat_workflow.toast.getting_location", "Obteniendo ubicación..."));
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          toast.dismiss(loadingToast);
          try {
            setIsTyping(true);
            await sendMessageMutation.mutateAsync({
              content: "",
              type: "location",
              attachment: {
                url: "",
                type: "location",
                name: "Ubicación",
                mimetype: "application/octet-stream",
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              },
              metadata: { tempId: `temp-${Date.now()}` },
            });
            toast.success(t("use_chat_workflow.toast.location_sent", "Ubicación enviada"));
          } catch (err) {
            console.error("[Workflow] Share location send error:", err);
            toast.error(t("use_chat_workflow.toast.location_send_error", "Error al enviar la ubicación"));
          } finally {
            setIsTyping(false);
          }
        },
        (geoErr) => {
          toast.dismiss(loadingToast);
          console.error("[Workflow] Geolocation error:", geoErr);
          toast.error(
            geoErr.code === geoErr.PERMISSION_DENIED
              ? t("use_chat_workflow.toast.location_permission_denied", "Permiso de ubicación denegado")
              : t("use_chat_workflow.toast.location_unavailable", "No se pudo obtener la ubicación"),
          );
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    },
    handleStarMessage: async (messageId: string, starred: boolean) => {
      try {
        await starMessageMutation.mutateAsync({ messageId, starred });
      } catch (err) {
        console.error("[Workflow] Star error:", err);
      }
    },
    handlePinMessage: async (messageId: string, pinned: boolean) => {
      try {
        await pinMessageMutation.mutateAsync({ messageId, pinned });
        toast.success(pinned ? t("use_chat_workflow.toast.message_pinned", "Mensaje fijado") : t("use_chat_workflow.toast.message_unpinned", "Mensaje desfijado"));
      } catch (err) {
        console.error("[Workflow] Pin error:", err);
      }
    },
    handleTransfer: async (targetId: string, type: "AGENT" | "QUEUE", note?: string) => {
      try {
        await chatService.transferTicket(ticketId, targetId, type, note);
        toast.success(type === "AGENT" ? t("use_chat_workflow.toast.transferred_to_agent", "Ticket transferido a agente") : t("use_chat_workflow.toast.transferred_to_queue", "Ticket transferido a cola"));
        // Optional: onBack() or similar if current agent loses access
      } catch (err) {
        toast.error(t("use_chat_workflow.toast.transfer_error", "Error al transferir ticket"));
        console.error("[Workflow] Transfer error:", err);
      }
    }
  };
};
