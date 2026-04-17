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
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ────────────────────────────────────────────────
  // AUTO-SCROLL
  // ────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isRemoteTyping, scrollToBottom]);

  // ────────────────────────────────────────────────
  // SOCKET LISTENERS
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!ticketId) return;

    // Listen for inbound messages via Socket.IO
    const handleIncomingMessage = (payload: Record<string, unknown>) => {
      // Backend emits two event shapes:
      // 1. 'message.received': { ticketId, message: {...}, conversation: {...} }
      // 2. 'conversation.new_message': { id, conversationId, content, direction, ... }
      
      // Extract the actual message object
      const rawMsg = (payload.message || payload) as Record<string, unknown>;
      const msgConversationId = (rawMsg.conversationId as string) || '';
      const payloadTicketId = (payload.ticketId as string) || '';
      
      // Match against the active ticket's ID
      const isForThisChat = 
        payloadTicketId === ticketId || 
        msgConversationId === ticketId;
      
      if (!isForThisChat) return;

      // Normalize the message for the React Query cache
      const normalizedMessage: Message = {
        id: rawMsg.id as string,
        ticketId: ticketId,
        companyId: (rawMsg.companyId as string) || '',
        senderType: (rawMsg.senderType as SenderType) || (rawMsg.direction === 'OUTBOUND' ? SenderType.AGENT : SenderType.USER),
        content: (rawMsg.content as string) || '',
        type: (rawMsg.type as Message['type']) || ((rawMsg.metadata as Record<string, any>)?.type as Message['type']) || 'text',
        mediaUrl: (rawMsg.mediaUrl as string) || ((rawMsg.metadata as Record<string, any>)?.mediaUrl as string) || undefined,
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
      if (aiConfig.isActive && normalizedMessage.sender === 'customer' && normalizedMessage.content) {
        analyzeSentiment(normalizedMessage.content).then(setSentiment);
      }
    };

    // Listen on BOTH events the backend emits
    socketService.on('message.received', handleIncomingMessage);
    socketService.on('conversation.new_message', handleIncomingMessage);
    // Also catch outbound echoes (messages from phone)
    socketService.on('message.sent', handleIncomingMessage);

    const cleanupTyping = socketService.onTypingStatus((payload) => {
       if (payload.ticketId === ticketId) {
         setIsRemoteTyping(payload.isTyping);
       }
    });

    return () => {
      socketService.off('message.received', handleIncomingMessage);
      socketService.off('conversation.new_message', handleIncomingMessage);
      socketService.off('message.sent', handleIncomingMessage);
      cleanupTyping();
    };
  }, [ticketId, queryClient, aiConfig.isActive]);

  // ────────────────────────────────────────────────
  // ACTIONS
  // ────────────────────────────────────────────────
  const handleSendMessage = async (content: string, mediaFile?: File | null, replyingTo?: Message | null) => {
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
        metadata: {
          quotedMessageId: replyingTo?.id,
          quotedContent: replyingTo?.content,
          tempId: `temp-${Date.now()}` // [SEC] Pre-generation for atomic sync
        }
      };

      await sendMessageMutation.mutateAsync(payload);
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
    chatEndRef,
    handleSendMessage,
    syncHistory,
    scrollToBottom,
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
