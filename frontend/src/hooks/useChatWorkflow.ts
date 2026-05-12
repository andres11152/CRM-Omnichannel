import { useState, useEffect, useCallback, useRef } from "react";
import { Message, Contact, AIConfig, QuickReply, SenderType } from "@/types";
import { socketService } from "@/services/socketService";
import { chatService } from "@/services/chatService";
import { messageCacheService } from "@/services/messageCacheService";
import { analyzeSentiment } from "@/services/geminiService";
import { toast } from "sonner";
import { useMessages, useSendMessage, addMessageToCache, useReactToMessage } from "./useChat";
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
  const queryClient = useQueryClient();
  const ticketId = activeContact.ticketId || ""; // [SEC] Fallback for type safety
  const { data: messages = [], isLoading: isLoadingMessages } = useMessages(ticketId);
  const sendMessageMutation = useSendMessage(ticketId);
  const reactMutation = useReactToMessage(ticketId);

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

  // Detect pinned messages from DB metadata on load
  useEffect(() => {
    if (messages.length > 0) {
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
      }
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
        console.warn(`[Workflow] [WS] ❌ Skipping message.`, {
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

      console.log(`[Workflow] [WS] ✅ Message accepted for current chat! clearing typing...`);
      // Clear typing indicator when a message is actually received
      setIsRemoteTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      // Normalize the message for the React Query cache
      const normalizedMessage: Message = {
        id: rawMsg.id as string,
        senderId: (rawMsg.senderId as string) || undefined,
        ticketId: ticketId,
        companyId: (rawMsg.companyId as string) || '',
        senderType: (rawMsg.senderType as SenderType) || (rawMsg.direction === 'OUTBOUND' ? SenderType.AGENT : SenderType.USER),
        content: (rawMsg.content as string) || '',
        type: (rawMsg.type as Message['type']) || ((rawMsg.metadata as Record<string, unknown>)?.type as Message['type']) || 'text',
        mediaUrl: (rawMsg.mediaUrl as string) || ((rawMsg.metadata as Record<string, unknown>)?.mediaUrl as string) || undefined,
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

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socketService.off('message.received', handleIncomingMessage);
      socketService.off('conversation.new_message', handleIncomingMessage);
      socketService.off('message.sent', handleIncomingMessage);
      socketService.off('conversation:typing', handleTypingStatus);
      socketService.off('message.pinned', handlePinEvent);
    };
  }, [ticketId, activeContact.id, activeContact.phone, queryClient, aiConfig.isActive]);

  // ────────────────────────────────────────────────
  // ACTIONS
  // ────────────────────────────────────────────────
  const handleSendMessage = async (content: string, mediaFile?: File | null, replyingTo?: Message | null, scheduledAt?: string | Date) => {
    if (!content.trim() && !mediaFile) return;

    try {
      setIsTyping(true);
      
      let mediaUrl: string | undefined;
      let detectedType: "text" | "image" | "audio" | "video" | "document" = "text";

      if (mediaFile) {
        // [SEC] Upload before sending message metadata
        try {
          const uploaded = await uploadMedia({ file: mediaFile });
          mediaUrl = uploaded.url;
          
          // Map backend type to frontend sendMessage expected type
          const mime = mediaFile.type.toLowerCase();
          if (mime.startsWith("image/")) detectedType = "image";
          else if (mime.startsWith("audio/") || mediaFile.name.endsWith(".webm") || mediaFile.name.endsWith(".ogg") || mediaFile.name.endsWith(".mp3")) detectedType = "audio";
          else if (mime.startsWith("video/")) detectedType = "video";
          else detectedType = "document";

          console.log(`[Workflow] Media uploaded:`, { url: mediaUrl, type: detectedType });
        } catch (uploadErr) {
          console.error("[Workflow] Upload failed:", uploadErr);
          toast.error("Error al subir archivo. Revisa tu conexión.");
          setIsTyping(false);
          return;
        }
      }

      const payload = {
        content,
        type: detectedType,
        mediaUrl,
        attachment: mediaUrl ? {
          url: mediaUrl,
          type: detectedType,
          name: mediaFile?.name || "Adjunto",
          mimetype: mediaFile?.type || "application/octet-stream"
        } : undefined,
        quotedMessageId: replyingTo?.id,
        quotedContent: replyingTo?.content,
        scheduledAt,
        metadata: {
          quotedMessageId: replyingTo?.id,
          quotedContent: replyingTo?.content,
          tempId: `temp-${Date.now()}` // [SEC] Pre-generation for atomic sync
        }
      };

      await sendMessageMutation.mutateAsync(payload);
      
      if (scheduledAt) {
        toast.success("Mensaje programado correctamente.");
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
      const loadingToast = toast.loading("Sincronizando historial desde WhatsApp...");
      
      await chatService.syncFullHistory(ticketId);
      
      // Invalidate query to refresh messages
      await queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });
      
      toast.dismiss(loadingToast);
      toast.success("Historial sincronizado correctamente.");
    } catch (err) {
      console.error("[Workflow] Sync error:", err);
      toast.error("Error al sincronizar historial. Revisa tu conexión.");
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
      await reactMutation.mutateAsync({ messageId, reaction });
    },
    handleTransfer: async (targetId: string, type: "AGENT" | "QUEUE") => {
      try {
        await chatService.transferTicket(ticketId, targetId, type);
        toast.success(`Ticket transferido correctamente a ${type === "AGENT" ? "un agente" : "una cola"}`);
        // Optional: onBack() or similar if current agent loses access
      } catch (err) {
        toast.error("Error al transferir ticket");
        console.error("[Workflow] Transfer error:", err);
      }
    }
  };
};
