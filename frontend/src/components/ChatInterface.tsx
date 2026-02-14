import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { jwtDecode } from "jwt-decode";
import {
  Contact,
  Message,
  SenderType,
  AIConfig,
  Tag,
  Document,
  User,
  QuickReply,
} from "@/types";
import { quickRepliesService } from "@/services/quickRepliesService";
import {
  Clock,
  CreditCard,
  FileText,
  Check,
  CheckCheck,
  X,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Ban,
  MessageSquare,
  ArrowLeft,
} from "lucide-react";
import {
  generateBotResponse,
  analyzeSentiment,
} from "@/services/geminiService";
import { socketService } from "@/services/socketService";
import { messageCacheService } from "@/services/messageCacheService";
import { QuickReplies } from "./QuickReplies";
import { InternalNotes } from "./InternalNotes";
import { MediaLibrary } from "./MediaLibrary";
import { Media, uploadMedia } from "@/services/mediaService";
import { StickerPicker } from "./StickerPicker";
import { ContactEditModal } from "./ContactEditModal";
import { API_BASE_URL, BASE_URL } from "@/services/apiConfig";
import { AudioRecorder } from "./AudioRecorder";
import { TransferModal } from "./TransferModal";
import { SmartComposer } from "./SmartComposer";
import { Customer360Panel } from "./Customer360Panel";
import { ChatHeaderEnhanced } from "./ChatHeaderEnhanced";
import { GroupParticipantsPanel } from "./GroupParticipantsPanel";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { ActivityModal } from "./crm/ActivityModal";
import { DealModal } from "./crm/DealModal";
import { ActionModals } from "./ActionModals";
import { EmailModal } from "./EmailModal";
import { ResolveTicketModal } from "./ResolveTicketModal";
import {
  resolveTicket,
  transferTicket,
  updatePriority,
} from "@/services/ticketService";
import { ResolutionType, TransferTicketDTO } from "@/types";

// ... (existing imports)

// Inside component:

interface TagBadgeProps {
  tag: { id: string; name: string; color: string };
  className?: string;
}

const TagBadge: React.FC<TagBadgeProps> = ({ tag, className = "" }) => {
  const getTagColors = (
    tailwindClass: string,
  ): { bg: string; text: string } => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      "bg-indigo-500 text-white": { bg: "#6366f1", text: "#ffffff" },
      "bg-blue-500 text-white": { bg: "#3b82f6", text: "#ffffff" },
      "bg-sky-500 text-white": { bg: "#0ea5e9", text: "#ffffff" },
      "bg-teal-500 text-white": { bg: "#14b8a6", text: "#ffffff" },
      "bg-emerald-500 text-white": { bg: "#10b981", text: "#ffffff" },
      "bg-green-500 text-white": { bg: "#22c55e", text: "#ffffff" },
      "bg-yellow-500 text-white": { bg: "#eab308", text: "#ffffff" },
      "bg-orange-500 text-white": { bg: "#f97316", text: "#ffffff" },
      "bg-red-500 text-white": { bg: "#ef4444", text: "#ffffff" },
      "bg-rose-500 text-white": { bg: "#f43f5e", text: "#ffffff" },
      "bg-pink-500 text-white": { bg: "#ec4899", text: "#ffffff" },
      "bg-purple-500 text-white": { bg: "#a855f7", text: "#ffffff" },
      "bg-violet-500 text-white": { bg: "#8b5cf6", text: "#ffffff" },
      "bg-gray-500 text-white": { bg: "#6b7280", text: "#ffffff" },
    };
    return colorMap[tailwindClass] || { bg: "#6b7280", text: "#ffffff" };
  };

  const colors = getTagColors(tag.color);

  return (
    <span
      className={`font-bold shadow-sm ${className}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {tag.name}
    </span>
  );
};

interface Props {
  activeContact: Contact;
  aiConfig: AIConfig;
  // In a real app, these would come from context/props
  knowledgeBaseDocs?: Document[];
  readOnly?: boolean;
  onBack?: () => void;
  onContactUpdate?: (contact: Contact) => void;
  /** ? 100-YEAR FIX: Optimistic Update Callback */
  onTicketUpdate?: (ticketId: string, updates: any) => void;
}

export const ChatInterface: React.FC<Props> = ({
  activeContact,
  aiConfig,
  knowledgeBaseDocs = [],
  readOnly = false,
  onBack,
  onContactUpdate,
  onTicketUpdate,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRemoteTyping, setIsRemoteTyping] = useState(false); // ? Added
  const [sentiment, setSentiment] = useState<string>("Neutral");
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  /* New State for Dynamic SLA Timer */
  const [lastInteraction, setLastInteraction] = useState<Date>(new Date());

  // Action Modals State
  const [actionModalType, setActionModalType] = useState<
    "SCHEDULE" | "PRODUCT" | "PAYMENT" | "DATA" | null
  >(null);

  // Local state for contact display to support immediate updates
  const [displayContact, setDisplayContact] = useState<Contact>(activeContact);

  useEffect(() => {
    setDisplayContact((prev) => {
      // PROACTIVE FIX: Preserve realContactId (UUID) if the incoming activeContact (from parent)
      // is "stale" (lacks realContactId/UUID) but refers to the same person (same phone).
      // This prevents the UI from reverting to "Unsaved" state after a successful save
      // while the parent list is still refreshing.

      let shouldPreserveUUID = false;
      if (prev?.realContactId && !activeContact.realContactId) {
        // Check for identity match (Phone is usually the stable identifier for WhatsApp)
        const cleanPrevPhone = prev.phone?.replace(/\D/g, "") || "";
        const cleanNewPhone = activeContact.phone?.replace(/\D/g, "") || "";

        if (
          cleanPrevPhone &&
          cleanNewPhone &&
          cleanPrevPhone === cleanNewPhone
        ) {
          shouldPreserveUUID = true;
        }
      }

      if (shouldPreserveUUID) {
        return {
          ...activeContact,
          realContactId: prev.realContactId,
          // We keep the rest of activeContact (like badging, lastMessage)
          // but inject the UUID we know exists.
        };
      }

      return activeContact;
    });
    setContactTags(activeContact.tags || []);
  }, [activeContact]);

  const [contactTags, setContactTags] = useState<string[]>(
    activeContact.tags || [],
  );
  const [tags, setTags] = useState<
    Array<{ id: string; name: string; color: string }>
  >([]);
  const [isCopied, setIsCopied] = useState(false);

  // New Features State
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showContactEditModal, setShowContactEditModal] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false); // New Resolve Modal State
  const [isResolving, setIsResolving] = useState(false);
  const [showParticipantsPanel, setShowParticipantsPanel] = useState(false);
  //  Customer 360 Toggle State
  const [isCustomer360Visible, setIsCustomer360Visible] = useState(() => {
    // ? 100-YEAR FIX: On small screens, ALWAYS start closed to avoid obscuring the chat
    if (typeof window !== "undefined" && window.innerWidth < 1024) return false;

    const saved = localStorage.getItem("customer360_visible");
    return saved !== null
      ? saved === "true"
      : typeof window !== "undefined" && window.innerWidth > 1024;
  });

  //  MOBILE UX FIX: Close 360 panel when switching chats on mobile
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsCustomer360Visible(false);
    }
  }, [activeContact.id]);

  // Rapid Actions State
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityModalType, setActivityModalType] = useState<
    "TASK" | "MEETING" | "NOTE"
  >("NOTE");
  const [showDealModal, setShowDealModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [currentPriority, setCurrentPriority] = useState<
    "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  >("MEDIUM");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Typing Indicators State
  const [otherAgentsTyping, setOtherAgentsTyping] = useState<
    Array<{ agentId: string; agentName: string }>
  >([]);

  // Socket Connection State
  const [socketStatus, setSocketStatus] = useState<
    "connected" | "disconnected"
  >("disconnected");

  // ? SLASH COMMANDS STATE
  const [quickRepliesData, setQuickRepliesData] = useState<QuickReply[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFiltered, setSlashFiltered] = useState<QuickReply[]>([]);

  // Load Quick Replies for Slash Commands
  useEffect(() => {
    quickRepliesService
      .getQuickReplies()
      .then((data) => setQuickRepliesData(data))
      .catch((err) =>
        console.error("Failed to load quick replies for slash commands:", err),
      );
  }, []);

  // Load tags from backend
  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE_URL}/tags`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load tags");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setTags(data);
        } else {
          console.warn("Tags response is not an array:", data);
          setTags([]);
        }
      })
      .catch((error) => {
        console.error("Error loading tags:", error);
        setTags([]);
      });
  }, []);

  // Load initial history & tags
  useEffect(() => {
    const fetchConversation = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${API_BASE_URL}/conversations/${activeContact.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();

        if (data.status === "success" && data.data.conversation) {
          const conv = data.data.conversation;
          const userParticipantId = conv.participants?.find(
            (p: any) => p.role === "USER",
          )?.id;

          // Map backend messages to frontend format
          const history = conv.messages.map((m: any, index: number) => {
            // âœ… IMPROVED: Determine senderType based on direction AND sender.role
            let type = SenderType.AGENT;
            const dir = (m.direction || "").toUpperCase();

            // DEBUG LOGGING
            if (index === 0)
              console.log("ï¿½ï¿½ [First Message Debug]", {
                id: m.id,
                content: m.content,
                direction: m.direction,
                senderId: m.senderId,
                senderRole: m.sender?.role,
                metadata: m.metadata,
                userParticipantId,
              });

            // ï¿½ï¿½ CRITICAL FIX: Check metadata for AI-generated messages
            if (m.metadata?.aiGenerated) {
              type = SenderType.AGENT;
            } else if (dir === "INBOUND") {
              type = SenderType.USER;
            } else if (dir === "OUTBOUND") {
              // Check if sender is the bot/agent
              if (
                m.sender?.role === "AGENT" ||
                m.sender?.email?.includes("@reply.bot")
              ) {
                type = SenderType.AGENT;
              } else if (
                m.senderId === userParticipantId ||
                m.senderId === activeContact.id
              ) {
                type = SenderType.USER;
              } else {
                type = SenderType.AGENT;
              }
            } else {
              // Robust Fallback
              if (
                m.senderId === userParticipantId ||
                m.senderId === activeContact.id ||
                m.senderId === activeContact.realContactId
              ) {
                type = SenderType.USER;
              } else {
                type = SenderType.AGENT;
              }
            }

            return {
              id: m.id,
              ticketId: activeContact.id,
              companyId: activeContact.companyId,
              content: m.content,
              senderType: type,
              timestamp: m.createdAt,
              senderName:
                type === SenderType.USER
                  ? activeContact.name
                  : m.metadata?.aiAssistantName || "You",
              attachment:
                m.metadata?.media || m.attachment || m.metadata?.attachment,
            };
          });

          // âœ… CRITICAL: Sort messages chronologically (oldest first)
          const sortedHistory = history.sort(
            (a: any, b: any) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );

          setMessages(sortedHistory.filter((m: any) => m.id));

          // ï¿½ï¿½ SAVE TO CACHE for offline access
          messageCacheService
            .saveMessages(activeContact.id, sortedHistory)
            .catch((err) => console.error("[Cache] Failed to save:", err));

          if (conv.tags && Array.isArray(conv.tags)) {
            setContactTags(conv.tags);
            setDisplayContact((prev) => ({ ...prev, tags: conv.tags })); // âœ… SYNC Header UI with fetched tags
            // ? 100-YEAR FIX: Propagate tags to parent (AgentWorkspace) to prevent overwriting with stale props
            if (onTicketUpdate) {
              onTicketUpdate(activeContact.id, { tags: conv.tags });
            }
          }
          if (conv.priority) {
            setCurrentPriority(conv.priority);
          }
        }
      } catch (error) {
        console.error("Failed to fetch history", error);
        // Fallback to last message if fetch fails
        setMessages([
          {
            id: "init-1",
            ticketId: activeContact.id,
            companyId: activeContact.companyId,
            content: activeContact.lastMessage,
            senderType: SenderType.USER,
            timestamp: activeContact.lastMessageTime,
            senderName: activeContact.name,
          },
        ]);
      }
    };

    fetchConversation();
    setContactTags(activeContact.tags || []);
    setSentiment("Neutral");
    setIsCopied(false);

    // âœ… SYNC TIMER ON LOAD
    if (activeContact.lastMessageTime) {
      setLastInteraction(new Date(activeContact.lastMessageTime));
    } else {
      setLastInteraction(new Date());
    }
  }, [activeContact.id]); //  100-YEAR FIX: Only re-fetch when ID changes, not on every object reference update

  // Socket Listener
  useEffect(() => {
    setIsRemoteTyping(false); // ? Reset typing status on chat switch
    // 1. Define Message Handler
    const handleIncomingMessage = (
      msg: Message & { conversationId?: string },
    ) => {
      // Compatibility: Backend sends conversationId, frontend uses ticketId
      const msgTicketId = msg.ticketId || msg.conversationId;

      if (!msgTicketId || msgTicketId !== activeContact.id) return;

      //  100-YEAR FIX: Normalize backend message format to frontend structure
      const processedMsg: Message = {
        ...msg,
        ticketId: msgTicketId,
        // Map createdAt -> timestamp (backend uses createdAt)
        timestamp: msg.timestamp || (msg as any).createdAt || new Date(),
        // Normalize senderType based on direction
        senderType:
          msg.senderType ||
          ((msg as any).direction === "OUTBOUND"
            ? SenderType.AGENT
            : SenderType.USER),
        companyId: msg.companyId || activeContact.companyId,
      };

      setMessages((prev) => {
        // Check if message already exists (by ID)
        const existingIndex = prev.findIndex((m) => m.id === processedMsg.id);

        if (existingIndex !== -1) {
          return prev;
        }

        //  ATOMIC REPLACEMENT: Find SPECIFIC temp message by content match
        // This prevents replacing the wrong temp message if multiple are in flight
        let optimisticIndex = prev.findIndex(
          (m) =>
            m.id &&
            m.id.startsWith("temp-") &&
            m.content?.trim() === processedMsg.content?.trim(),
        );

        // Fallback: If no exact content match, assume FIFO (First-In-First-Out)
        // This handles cases where content might be slightly modified by backend or simple race conditions
        if (optimisticIndex === -1) {
          const tempMessages = prev
            .map((m, idx) => ({ ...m, idx }))
            .filter((m) => m.id && m.id.startsWith("temp-"));

          if (tempMessages.length > 0) {
            // ? FIFO STRATEGY: Replace the oldest temp message
            // We assume socket ACKs usually come in order
            optimisticIndex = tempMessages[0].idx;
          }
        }

        if (optimisticIndex !== -1) {
          console.log(
            "[Socket]  Replacing temp:",
            prev[optimisticIndex].id,
            "->",
            processedMsg.id,
          );
          const updated = [...prev];
          updated[optimisticIndex] = processedMsg;
          return updated;
        }

        console.log("[ChatInterface] ? Message appended:", processedMsg.id);
        const newState = [...prev, processedMsg];
        //  NUCLEAR OPTION: Enforce uniqueness by ID
        return Array.from(new Map(newState.map((m) => [m.id, m])).values());
      });

      // Trigger scroll
      if (chatEndRef.current) {
        setTimeout(
          () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }),
          100,
        );
      }

      // âœ… UPDATE TIMER ON INBOUND
      setLastInteraction(new Date());
    };

    // 2. Define Join Function
    const joinRoom = () => {
      if (!activeContact.id) return;

      console.log(
        `[ChatInterface] ï¿½ï¿½ Joining conversation room: ${activeContact.id}`,
      );
      socketService.emit("join_room", { conversationId: activeContact.id });
    };

    // 3. Define Connect/Disconnect Handlers
    const handleConnect = () => {
      console.log("[ChatInterface] ï¿½ï¿½ Socket Connected");
      setSocketStatus("connected");
      joinRoom(); // Re-join on reconnect
    };

    const handleDisconnect = () => {
      console.log("[ChatInterface] ï¿½ï¿½ Socket Disconnected");
      setSocketStatus("disconnected");
    };

    // 4. Setup Listeners
    // FIX: Match backend event name 'conversation.new_message'
    socketService.on("conversation.new_message", handleIncomingMessage);
    socketService.on("connect", handleConnect);
    socketService.on("disconnect", handleDisconnect);

    // 5. Initial Actions
    // @ts-ignore - Check internal state if possible, or just emit blindly (safe in Socket.io)
    if (socketService.socket?.connected) {
      setSocketStatus("connected");
      joinRoom();
    } else {
      // Force connect if needed
      socketService.connect();
    }

    // 6. Typing Indicators
    //  CUSTOMER TYPING (WhatsApp -> CRM)
    //  CUSTOMER TYPING (WhatsApp -> CRM)
    // We use the normalized event from MessageHandler which handles LIDs and Phone mapping
    const handleConversationTyping = (data: {
      conversationId: string;
      from: string;
      status: "composing" | "recording" | "paused";
    }) => {
      // Robust check: Ensure event belongs to this conversation
      if (data.conversationId === activeContact.id) {
        if (data.status === "composing" || data.status === "recording") {
          setIsRemoteTyping(true);
          // Safety timeout (clears if no 'paused' event received)
          setTimeout(() => setIsRemoteTyping(false), 10000);
        } else {
          setIsRemoteTyping(false);
        }
      }
    };
    socketService.on("conversation:typing", handleConversationTyping);

    //  AGENT TYPING (Other agents -> CRM)
    const handleAgentTyping = (data: {
      ticketId: string;
      agentId: string;
      agentName: string;
    }) => {
      if (data.ticketId === activeContact.id) {
        setOtherAgentsTyping((prev) => {
          if (prev.some((a) => a.agentId === data.agentId)) return prev;
          return [
            ...prev,
            { agentId: data.agentId, agentName: data.agentName },
          ];
        });
      }
    };
    const handleAgentStoppedTyping = (data: {
      ticketId: string;
      agentId: string;
    }) => {
      if (data.ticketId === activeContact.id) {
        setOtherAgentsTyping((prev) =>
          prev.filter((a) => a.agentId !== data.agentId),
        );
      }
    };
    socketService.on("agent.typing", handleAgentTyping);
    socketService.on("agent.stopped_typing", handleAgentStoppedTyping);

    // 7. Cleanup
    return () => {
      console.log(
        `[ChatInterface]  Cleaning up listeners for ${activeContact.id}`,
      );
      socketService.off("conversation.new_message", handleIncomingMessage);
      socketService.off("connect", handleConnect);
      socketService.off("disconnect", handleDisconnect);
      socketService.off("conversation:typing", handleConversationTyping); // ? CLEANUP
      socketService.off("agent.typing", handleAgentTyping);
      socketService.off("agent.stopped_typing", handleAgentStoppedTyping);
    };
  }, [activeContact.id]); // Re-run ONLY when activeContact.id changes

  // Scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, isRemoteTyping]);

  // Sentiment
  useEffect(() => {
    if (messages.length > 0) {
      const lastUserMsg = [...messages]
        .reverse()
        .find((m) => m.senderType === SenderType.USER);
      if (lastUserMsg) {
        analyzeSentiment(lastUserMsg.content).then(setSentiment);
      }
    }
  }, [messages]);

  const triggerAIResponse = async (userMsg: Message) => {
    // Guard: Only trigger if AI is explicitly enabled
    if (!aiConfig.isActive) return;

    // Guard: Check if API key is configured (from env)
    const apiKey = import.meta.env.VITE_API_KEY;
    if (!apiKey) {
      console.info("[AI] Skipping auto-response: No API key configured");
      return;
    }

    setIsTyping(true);

    try {
      const botReplyText = await generateBotResponse(
        [...messages, userMsg],
        aiConfig.systemPrompt,
        aiConfig.model,
        knowledgeBaseDocs,
      );

      // Only show bot message if we got a valid response
      if (botReplyText && botReplyText.trim().length > 0) {
        const botMessage: Message = {
          id: "bot-" + Date.now().toString(),
          ticketId: activeContact.id,
          companyId: activeContact.companyId,
          content: botReplyText,
          senderType: SenderType.AGENT,
          timestamp: new Date(),
          senderName: "Bot",
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (error) {
      // Silently fail - do not show error to user
      console.info("[AI] Auto-response skipped due to API error");
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !selectedFile) return;

    const tempId = "temp-" + Date.now().toString();
    const content = inputValue;

    // Clear states immediately
    setInputValue("");
    const fileToSend = selectedFile;
    setSelectedFile(null);

    // Prepare attachment promise
    let attachmentPromise: Promise<any> | null = null;
    let optimisticAttachment: any = null;

    if (fileToSend) {
      // Create optimistic attachment
      let type: "image" | "video" | "file" = "file";
      if (fileToSend.type.startsWith("image/")) type = "image";
      else if (fileToSend.type.startsWith("video/")) type = "video";

      optimisticAttachment = {
        id: `temp-att-${Date.now()}`,
        type,
        url: URL.createObjectURL(fileToSend), // Local preview URL
        name: fileToSend.name,
        mimetype: fileToSend.type,
      };

      // Upload to Server (100-Year Solution: Store File, Send URL)
      // We avoid sending huge Base64 strings to the WebSocket/DB
      attachmentPromise = uploadMedia({
        file: fileToSend,
        category: "CHAT_ATTACHMENT",
      }).then((media) => ({
        id: media.id,
        type: type,
        url: media.url,
        name: media.originalName,
        mimetype: media.mimeType,
      }));
    }

    // Optimistic update
    const optimisticMessage: Message = {
      id: tempId,
      ticketId: activeContact.id,
      companyId: activeContact.companyId,
      content: content,
      senderType: SenderType.AGENT,
      timestamp: new Date(),
      senderName: "You",
      attachment: optimisticAttachment,
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const token = localStorage.getItem("token");

      let finalAttachment = null;
      if (attachmentPromise) {
        finalAttachment = await attachmentPromise;
      }

      console.log("[Chat] Sending payload:", {
        content,
        channel: "WHATSAPP",
        attachment: finalAttachment ? "Present" : "None",
      });

      const res = await fetch(
        `${API_BASE_URL}/conversations/${activeContact.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: content,
            channel: "WHATSAPP",
            attachment: finalAttachment,
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to send message");
      }

      const data = await res.json();
      const serverMsg = data.data.message;

      //  100-YEAR FIX: Time-based deduplication
      // Prevents processing same message twice if both API and Socket arrive simultaneously
      const dedupeKey = `reconcile-${serverMsg.id}`;
      const now = Date.now();
      const lastRun = (window as any)[dedupeKey] || 0;

      if (now - lastRun < 50) {
        console.log(
          "[ChatInterface]  Skipping duplicate reconciliation (< 50ms)",
        );
        return;
      }
      (window as any)[dedupeKey] = now;

      // Race Condition Protection
      // Only replace optimistic message if Socket.IO hasn't already done it
      setMessages((prev) => {
        // Check if server message already exists (Socket.IO beat us)
        const serverMsgExists = prev.some((m) => m.id === serverMsg.id);

        if (serverMsgExists) {
          // Socket.IO already added the real message
          // Only filter if temp still exists (avoid no-op re-render)
          const tempExists = prev.some((m) => m.id === tempId);
          if (!tempExists) {
            console.log("[API]  Socket already handled, temp gone");
            return prev; // No change needed
          }
          console.log("[API]  Socket won race, cleaning temp:", tempId);
          return prev.filter((m) => m.id !== tempId);
        }

        // Socket.IO hasn't arrived yet, replace temp with server message
        return prev.map((m) =>
          m.id === tempId
            ? {
                ...serverMsg,
                id: serverMsg.id,
                ticketId: activeContact.id,
                companyId: activeContact.companyId,
                content: serverMsg.content,
                senderType: SenderType.AGENT,
                timestamp: serverMsg.createdAt,
                senderName: "You",
                attachment: finalAttachment,
              }
            : m,
        );
      });
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(`Error al enviar: ${error.message}`);
      setMessages((prev) => prev.filter((m) => m.id !== tempId)); // Rollback
      setInputValue(content);
      setSelectedFile(fileToSend); // Restore file
    }

    // ? UPDATE TIMER ON OUTBOUND
    setLastInteraction(new Date());
  };

  /**
   *  SYNC HISTORY HANDLER
   * Triggers on-demand history synchronization for this chat
   */
  const handleSyncHistory = async () => {
    if (!activeContact.phone) {
      toast.error("No se puede sincronizar: El contacto no tiene telï¿½fono");
      return;
    }

    const toastId = toast.loading("Sincronizando historial...");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE_URL}/whatsapp/sync/conversation/${activeContact.phone.replace(/\D/g, "")}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Error al sincronizar");
      }

      const data = await res.json();
      const count = data.data.synced || 0;

      if (count > 0) {
        toast.success(`Historial sincronizado: ${count} mensajes nuevos`, {
          id: toastId,
        });
        // Reload to show new messages (Option B)
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.info("No se encontraron mensajes nuevos en el historial", {
          id: toastId,
        });
      }
    } catch (error) {
      console.error("Sync failed", error);
      toast.error("Error al sincronizar el historial", { id: toastId });
    }
  };

  const handleSaveSticker = async (stickerUrl: string) => {
    try {
      const loadingToast = toast.loading("Guardando sticker...");

      // 1. Fetch the blob
      const fullUrl = stickerUrl.startsWith("http")
        ? stickerUrl
        : `${BASE_URL}${stickerUrl}`;
      const res = await fetch(fullUrl);
      const blob = await res.blob();

      // 2. Create File object
      const filename = `sticker_${Date.now()}.webp`;
      const file = new File([blob], filename, { type: "image/webp" });

      // 3. Upload with category 'STICKER'
      await uploadMedia({
        file,
        category: "STICKER",
        description: "Saved from chat",
      });

      toast.dismiss(loadingToast);
      toast.success("? Sticker guardado en favoritos");
    } catch (error) {
      console.error(error);
      toast.dismiss();
      toast.error("Error al guardar sticker");
    }
  };

  const handleStickerSelect = async (sticker: Media) => {
    // Send directly
    setShowStickerPicker(false);

    // Create optimistic attachment object
    const attachment = {
      id: sticker.id,
      type: "sticker" as const,
      url: sticker.url,
      name: sticker.originalName,
      mimeType: sticker.mimeType,
    };

    // Send logic (lighter version of handleSendMessage)
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${API_BASE_URL}/conversations/${activeContact.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: "",
            channel: "WHATSAPP",
            attachment: { ...attachment, type: "image" }, // Backend expects 'image' type mostly, but metadata handles it?
            // Actually, backend supports 'sticker' now?
            // Let's check conversationController. It just passes attachment.
            // WhatsappService.sendMessage handles media.
            // Standard WA stickers are images (webp).
            // Let's pass 'sticker' type if backend supports it.
            // If not, 'image' usually works for webp.
            // Let's try sending as 'sticker' type in attachment object if controller allows it.
          }),
        },
      );

      if (!res.ok) throw new Error("Failed to send sticker");

      // Optimistic update
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        ticketId: activeContact.id,
        companyId: activeContact.companyId,
        content: "[STICKER]",
        senderType: SenderType.AGENT,
        timestamp: new Date(),
        senderName: "You",
        attachment: attachment,
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      // ? UPDATE TIMER ON STICKER
      setLastInteraction(new Date());
    } catch (error) {
      console.error(error);
      toast.error("Error enviando sticker");
    }
  };

  // --- Action Handlers ---
  const handleScheduleConfirm = async (date: Date, messageContent: string) => {
    setActionModalType(null);

    // 1. Optimistic UI: Show as a "Pending" message in the chat
    const optimisticMessage: Message = {
      id: `sched-${Date.now()}`,
      ticketId: activeContact.id,
      content: ` MENSAJE PROGRAMADO:\n\n${messageContent}\n\n Para: ${date.toLocaleString()}`,
      senderType: SenderType.AGENT,
      timestamp: new Date(),
      senderName: "System",
      companyId: activeContact.companyId,
      status: "SCHEDULED", // Visual indicator
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    toast.success("Mensaje programado exitosamente");

    // 2. Persist to Backend as Real Scheduled Message
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(
        `${API_BASE_URL}/conversations/${activeContact.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: messageContent,
            channel: "WHATSAPP",
            scheduledAt: date.toISOString(), //  Triggers backend scheduling
          }),
        },
      );

      if (!res.ok) {
        throw new Error("Failed to schedule message");
      }

      // Note: When page refreshes, the message with STATUS='SCHEDULED' will key loaded from DB
    } catch (e) {
      console.error("Failed to schedule message", e);
      toast.error("Error de conexiï¿½n al programar");
      // Optionally revert optimistic UI here
    }
  };

  const handleProductSelect = async (product: any) => {
    setActionModalType(null);

    const token = localStorage.getItem("token");

    // Format price correctly based on currency
    const formattedPrice =
      product.currency === "COP"
        ? new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            minimumFractionDigits: 0,
          }).format(product.price)
        : new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: product.currency || "USD",
          }).format(product.price);

    const caption = ` *${product.name}*\n${product.description || ""}\n\n Precio: ${formattedPrice}`;

    // Construct robust attachment object - handle case where imageUrl might be null/undefined
    const hasImage =
      product.imageUrl &&
      typeof product.imageUrl === "string" &&
      product.imageUrl.startsWith("http");

    const attachment = hasImage
      ? {
          id: `prod-${product.id}`,
          type: "image" as const,
          url: product.imageUrl,
          name: product.name,
          mimeType: "image/jpeg",
        }
      : undefined;

    try {
      toast.loading("Enviando producto...");

      const res = await fetch(
        `${API_BASE_URL}/conversations/${activeContact.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: caption,
            channel: "WHATSAPP",
            attachment,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send product");
      }

      toast.dismiss();
      toast.success("Producto enviado");

      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        ticketId: activeContact.id,
        companyId: activeContact.companyId,
        content: caption,
        senderType: SenderType.AGENT,
        timestamp: new Date(),
        senderName: "You",
        ...(attachment && { attachment }),
      };
      setMessages((prev) => [...prev, optimisticMessage]);
    } catch (error) {
      console.error(error);
      toast.dismiss();
      toast.error("Error enviando producto");
    }
  };

  const handlePaymentCreate = async (amount: string, concept: string) => {
    setActionModalType(null);
    // Send as structured text card
    const text = ` *SOLICITUD DE PAGO*\n\nConcepto: ${concept}\nTotal: $${amount}\n\n Link de pago seguro: https://pay.reply.com/${Date.now()}`; // Mock link

    // Send via standard message
    handleDirectSend(text);
  };

  const handleDataRequestSelect = async (type: string) => {
    setActionModalType(null);
    const text = ` *SOLICITUD DE DATOS*\n\nHola, para continuar con tu proceso, por favor confï¿½rmanos tu: *${type}*.\n\nPuedes responder a este mensaje.`;
    handleDirectSend(text);
  };

  const handleDirectSend = async (text: string) => {
    const token = localStorage.getItem("token");
    const tempId = `temp-${Date.now()}`;

    // Optimistic
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        ticketId: activeContact.id,
        companyId: activeContact.companyId,
        content: text,
        senderType: SenderType.AGENT,
        timestamp: new Date(),
        senderName: "You",
        status: "sent", // Assume sent
      },
    ]);

    try {
      await fetch(`${API_BASE_URL}/conversations/${activeContact.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: text, channel: "WHATSAPP" }),
      });
    } catch (e) {
      console.error(e);
      toast.error("Error al enviar");
      // Should revert optimistic here
    }
  };

  const handleTypingIndicator = () => {
    //  Emit typing event to backend for WhatsApp Sync
    const token = localStorage.getItem("token");

    // Determine the remote ID (phone number)
    // If channelId looks like a phone/JID, use it. Otherwise try 'phone' property if exists.
    // Assuming activeContact is a Contact/Ticket object.
    const remoteId = (activeContact as any).phone || activeContact.channelId;

    if (token && remoteId) {
      socketService.emit("conversation:typing", {
        to: remoteId,
        status: "composing",
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to emit "stopped typing" after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (token && remoteId) {
        socketService.emit("conversation:typing", {
          to: remoteId,
          status: "paused",
        });
      }
    }, 3000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    e.target.value = "";
  };

  const handleMediaSelect = async (media: Media) => {
    setShowMediaLibrary(false);

    try {
      const loadingToast = toast.loading("Cargando archivo...");

      let blob: Blob;

      // ? CORS PREVENTION:
      // S3 Signed URLs often block 'fetch()' from browser due to CORS.
      // We prioritize the Backend Proxy which is safer for this operation.
      const proxyUrl = `${API_BASE_URL}/media/${media.id}/content`;

      try {
        // Try Proxy First (Public Endpoint)
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
        blob = await res.blob();
      } catch (e) {
        console.warn("Proxy fetch failed, trying direct URL:", e);
        // Fallback to direct URL (e.g. for local files or if proxy fails)
        const res = await fetch(media.url);
        if (!res.ok) throw new Error(`Direct fetch error: ${res.status}`);
        blob = await res.blob();
      }

      const file = new File([blob], media.originalName, {
        type: media.mimeType,
      });

      setSelectedFile(file);
      toast.dismiss(loadingToast);

      setTimeout(() => {
        const input = document.querySelector("textarea");
        input?.focus();
      }, 100);
    } catch (error) {
      console.error("Error loading media:", error);
      toast.dismiss();
      toast.error("No se pudo cargar la imagen (Error de red/CORS).");
    }
  };

  const handleVoiceNoteSend = async (blob: Blob) => {
    setIsRecording(false);

    //  Stop recording status
    const remoteId = (activeContact as any).phone || activeContact.channelId;
    if (remoteId) {
      socketService.emit("conversation:typing", {
        to: remoteId,
        status: "paused",
      });
    }

    //  Use FileReader to convert Blob to Base64 (Reliable fallback if upload API fails)
    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = reader.result as string;
      const tempId = "temp-" + Date.now().toString();

      //  MIME Type strategy:
      // Send the REAL mimetype (audio/webm;codecs=opus) so the backend knows what it receives.
      const mimeType = blob.type || "audio/webm;codecs=opus";
      const fileExt = mimeType.includes("ogg") ? "ogg" : "webm";
      const fileName = `voice-note-${Date.now()}.${fileExt}`;

      const attachment = {
        id: `vn-${Date.now()}`,
        type: "audio" as const,
        url: base64,
        name: fileName,
        mimetype: mimeType,
        isVoiceNote: true,
      };

      const newMessage: Message = {
        id: tempId,
        ticketId: activeContact.id,
        companyId: activeContact.companyId,
        content: "",
        senderType: SenderType.AGENT,
        timestamp: new Date(),
        senderName: "You",
        attachment,
      };
      // Optimistic Update
      setMessages((prev) => [...prev, newMessage]);

      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${API_BASE_URL}/conversations/${activeContact.id}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: "",
              channel: "WHATSAPP",
              attachment: attachment,
            }),
          },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Failed to send voice note");
        }

        const data = await res.json();
        const serverMsg = data.data.message;

        // ? Update optimistic message with server response
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...serverMsg,
                  attachment: attachment, // Keep local base64 for playing until refresh
                  timestamp: serverMsg.createdAt,
                }
              : m,
          ),
        );

        setLastInteraction(new Date());
      } catch (error) {
        console.error("Error sending voice note:", error);
        toast.error("Error al enviar nota de voz");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    };
    reader.onerror = () => {
      toast.error("Error leyendo audio");
      setIsRecording(false);
    };

    reader.readAsDataURL(blob);
  };

  const toggleTag = async (tagId: string) => {
    const newTags = contactTags.includes(tagId)
      ? contactTags.filter((t) => t !== tagId)
      : [...contactTags, tagId];

    setContactTags(newTags); // Optimistic update
    setDisplayContact((prev) => ({ ...prev, tags: newTags })); // âœ… SYNC Header UI

    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/conversations/${activeContact.id}/tags`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tags: newTags }),
      });
    } catch (error) {
      console.error("Error updating tags:", error);
      setContactTags(contactTags); // Rollback
      setDisplayContact((prev) => ({ ...prev, tags: contactTags })); // Rollback Match
    }
  };

  const handleCopyChat = () => {
    const transcript = messages
      .map((m) => {
        const date = new Date(m.timestamp);
        const time = !isNaN(date.getTime())
          ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";
        const sender =
          m.senderType === SenderType.USER
            ? activeContact.name
            : m.senderType === SenderType.BOT
              ? "AI"
              : "Agente";
        const attachmentInfo = m.attachment
          ? ` [Adjunto: ${m.attachment.name || m.attachment.type}]`
          : "";
        return `[${time}] ${sender}: ${m.content}${attachmentInfo}`;
      })
      .join("\n");

    navigator.clipboard.writeText(transcript);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Helper function to convert Tailwind classes to actual colors
  const getTagColors = (
    tailwindClass: string,
  ): { bg: string; text: string } => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      "bg-indigo-500 text-white": { bg: "#6366f1", text: "#ffffff" },
      "bg-blue-500 text-white": { bg: "#3b82f6", text: "#ffffff" },
      "bg-sky-500 text-white": { bg: "#0ea5e9", text: "#ffffff" },
      "bg-teal-500 text-white": { bg: "#14b8a6", text: "#ffffff" },
      "bg-emerald-500 text-white": { bg: "#10b981", text: "#ffffff" },
      "bg-green-500 text-white": { bg: "#22c55e", text: "#ffffff" },
      "bg-yellow-500 text-white": { bg: "#eab308", text: "#ffffff" },
      "bg-orange-500 text-white": { bg: "#f97316", text: "#ffffff" },
      "bg-red-500 text-white": { bg: "#ef4444", text: "#ffffff" },
      "bg-rose-500 text-white": { bg: "#f43f5e", text: "#ffffff" },
      "bg-pink-500 text-white": { bg: "#ec4899", text: "#ffffff" },
      "bg-purple-500 text-white": { bg: "#a855f7", text: "#ffffff" },
      "bg-violet-500 text-white": { bg: "#8b5cf6", text: "#ffffff" },
      "bg-gray-500 text-white": { bg: "#6b7280", text: "#ffffff" },
    };
    return colorMap[tailwindClass] || { bg: "#6b7280", text: "#ffffff" };
  };

  const getTagObj = (id: string) =>
    Array.isArray(tags) ? tags.find((t) => t.id === id) : undefined;

  const handleTransfer = () => {
    setShowTransferModal(true);
  };

  const handleTransferSubmit = async (
    targetId: string,
    type: "AGENT" | "QUEUE",
  ) => {
    try {
      // If transferring to queue, unassign agent. If to agent, assign agent.
      const payload: TransferTicketDTO =
        type === "AGENT"
          ? { assignedToId: targetId, status: "OPEN" }
          : { queueId: targetId, assignedToId: null, status: "OPEN" }; // Explicit null to unassign

      // If backend specifically needs explicit null for unassignment, we might need to adjust DTO
      // Assuming standard PATCH:
      // If backend specifically needs explicit null for unassignment, we might need to adjust DTO
      // Assuming standard PATCH:
      await transferTicket(
        activeContact.ticketId || activeContact.id,
        payload as any,
      );

      // ? 100-YEAR FIX: Optimistic Update to Parent
      if (onTicketUpdate) {
        onTicketUpdate(activeContact.ticketId || activeContact.id, {
          assignedToId: type === "AGENT" ? targetId : null,
          queueId: type === "QUEUE" ? targetId : undefined,
          status: "OPEN",
        });
      }

      setTransferSuccess(true);
      toast.success("Transferencia exitosa");

      // ? 100-YEAR FIX: Visual Cleanup
      if (onBack) setTimeout(() => onBack(), 50);
    } catch (error) {
      console.error("Transfer failed", error);
      toast.error("Error al transferir el ticket");
    }
  };

  const handleResolveTicket = async (type: string, notes: string) => {
    const ticketId = activeContact.ticketId || activeContact.id;
    if (!ticketId) {
      toast.error("Error: No se encontrï¿½ el ID del ticket");
      console.error("Missing ticketId for contact:", activeContact);
      return;
    }

    setIsResolving(true);
    try {
      await resolveTicket(ticketId, {
        status: "RESOLVED",
        resolutionType: type as ResolutionType,
        resolutionNotes: notes,
      });

      toast.success("Ticket resuelto correctamente");
      setShowResolveModal(false);

      if (onBack) onBack();
    } catch (error: any) {
      console.error("Resolve failed", error);
      toast.error(error.message || "Error al resolver el ticket");
    } finally {
      setIsResolving(false);
    }
  };

  const handleChangePriority = async (
    newPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  ) => {
    // 1. Optimistic Update
    const oldPriority = currentPriority;
    setCurrentPriority(newPriority);

    try {
      await updatePriority(
        activeContact.ticketId || activeContact.id,
        newPriority,
      );
      toast.success(`Prioridad actualizada a ${newPriority}`);
    } catch (error) {
      console.error("Error updating priority", error);
      toast.error("Error al actualizar prioridad");
      setCurrentPriority(oldPriority); // Rollback
    }
  };

  return (
    <>
      {/*  MOBILE NAVIGATION PORTAL: Volver al Chat (Solo visible en 360 mï¿½vil) */}
      {isCustomer360Visible &&
        typeof window !== "undefined" &&
        window.innerWidth < 1024 &&
        createPortal(
          <div className="flex items-center mr-2 animate-in slide-in-from-right-4 duration-300">
            <button
              onClick={() => {
                setIsCustomer360Visible(false);
                localStorage.setItem("customer360_visible", "false");
              }}
              className="flex items-center justify-center p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md shadow-indigo-500/20 transition-all active:scale-95"
              title="Volver al Chat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>,
          document.getElementById("header-actions-portal")!,
        )}

      <div className="flex h-full w-full overflow-hidden relative">
        {/* âœ… LEVEL 2: Main Chat Area - flex: 1, min-width: 0 (CRï¿½TICO para shrink) */}
        <div className="flex flex-col flex-1 min-w-0 h-full relative">
          {/* âœ… LEVEL 3A: Chat Header - flex-shrink-0 */}
          <div className="flex-shrink-0">
            <ChatHeaderEnhanced
              contact={displayContact}
              isTyping={isRemoteTyping}
              onBack={onBack}
              onEditContact={() => setShowContactEditModal(true)}
              onResolve={() => setShowResolveModal(true)}
              onEmail={() => setShowEmailModal(true)}
              onTransfer={handleTransfer}
              onCopyChat={handleCopyChat}
              onTagsClick={() => setShowTagMenu(!showTagMenu)}
              isCopied={isCopied}
              socketStatus={socketStatus}
              onForceReconnect={async () => {
                console.log("ï¿½ï¿½ Forcing socket + WhatsApp reconnection...");
                const token = localStorage.getItem("token");

                // 1. Reconnect Socket (Local)
                socketService.disconnect();
                setTimeout(() => {
                  socketService.connect();
                  socketService.emit("join_room", {
                    conversationId: activeContact.id,
                  });
                }, 500);

                // 2. Reconnect Backend WhatsApp Session
                try {
                  toast.loading("Reiniciando conexiï¿½n WhatsApp...");
                  const res = await fetch(`${API_BASE_URL}/whatsapp/sessions`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const data = await res.json();

                  if (
                    data.status === "success" &&
                    Array.isArray(data.data.sessions)
                  ) {
                    const sessions = data.data.sessions;
                    // Determine target session (use contact's channelId if possible, or reconnect all disconnected)
                    // Ideally we find the session matching the conversation, but safe fallback is reconnect disconnected ones.

                    const targetSessions = sessions.filter(
                      (s: any) => s.status === "DISCONNECTED",
                    );

                    if (targetSessions.length > 0) {
                      for (const session of targetSessions) {
                        await fetch(
                          `${API_BASE_URL}/whatsapp/sessions/${session.sessionId}/reconnect`,
                          {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          },
                        );
                      }
                      toast.success("Solicitud de reconexiï¿½n enviada");
                    } else {
                      // Force reconnect the first one if all appear connected but user insists
                      if (sessions.length > 0) {
                        await fetch(
                          `${API_BASE_URL}/whatsapp/sessions/${sessions[0].sessionId}/reconnect`,
                          {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          },
                        );
                        toast.success("Reiniciando sesiï¿½n principal...");
                      } else {
                        toast.info(
                          "No se encontraron sesiones para reconectar",
                        );
                      }
                    }
                  }
                } catch (e) {
                  console.error("Error reconnecting whatsapp", e);
                  toast.error("Error al intentar reconectar WhatsApp");
                }
              }}
              ticketCreatedAt={lastInteraction}
              responseTimeSLA={15}
              onAssignTo={(agentId) => {
                console.log("ï¿½ï¿½ Asignando ticket a agente:", agentId);
                toast.success("Ticket asignado correctamente");
              }}
              onChangePriority={(priority) =>
                handleChangePriority(priority as any)
              }
              currentPriority={currentPriority as "LOW" | "MEDIUM" | "HIGH"}
              agents={[]} // âœ… TODO: Obtener del backend
              availableTags={tags}
              // PANEL 360 TOGGLE
              onToggleCustomer360={() => {
                const newState = !isCustomer360Visible;
                setIsCustomer360Visible(newState);
                localStorage.setItem("customer360_visible", String(newState));
              }}
              isCustomer360Visible={isCustomer360Visible}
              // GROUP PARTICIPANTS PANEL
              onToggleParticipantsPanel={
                activeContact.isGroup
                  ? () => setShowParticipantsPanel(!showParticipantsPanel)
                  : undefined
              }
              isParticipantsPanelVisible={showParticipantsPanel}
              onSyncHistory={handleSyncHistory} //  WIRING UP
            />
          </div>

          {/* Tag Menu (posiciï¿½n absoluta sobre el header) */}
          {showTagMenu && (
            <div className="absolute right-6 top-20 w-72 bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl border-2 border-gray-200 dark:border-reply-border-dark p-3 z-[100] max-h-96 overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-reply-border-dark">
                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-indigo-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  Asignar Etiquetas
                </h4>
                <button
                  onClick={() => setShowTagMenu(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {tags.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <svg
                    className="w-12 h-12 mx-auto mb-2 opacity-50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  <p className="text-xs italic">No hay etiquetas disponibles</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {tags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-reply-bg dark:hover:bg-gray-800 rounded-lg cursor-pointer group transition-all border border-transparent hover:border-indigo-200 dark:hover:border-indigo-900"
                    >
                      <input
                        type="checkbox"
                        checked={contactTags.includes(tag.id)}
                        onChange={() => toggleTag(tag.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                      />
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-bold ${tag.color} shadow-sm flex-1 text-center group-hover:scale-105 transition-transform`}
                      >
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* âœ… LEVEL 3B: Chat Messages Area - flex: 1, overflow-y: auto (scroll independiente) */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-reply-bg dark:bg-reply-bg-dark">
            <div className="p-3 sm:p-4 space-y-2">
              {messages.map((msg, index) => {
                const isUser =
                  msg.senderType === SenderType.USER &&
                  msg.direction !== "OUTBOUND";
                const isBot = msg.senderType === SenderType.BOT;
                const isAgent = msg.senderType === SenderType.AGENT;
                const isOutgoing =
                  isAgent || isBot || msg.direction === "OUTBOUND";

                return (
                  <div
                    key={`${msg.id}-${index}`}
                    className={`flex ${isOutgoing ? "justify-end" : "justify-start"} mb-1.5`}
                  >
                    <div
                      className={`max-w-[70%] rounded-xl px-3 py-2 relative shadow-sm text-sm leading-relaxed
                    ${
                      isOutgoing
                        ? "bg-reply-green dark:bg-reply-green-dark text-white rounded-tr-none"
                        : "bg-white dark:bg-reply-panel-dark text-reply-text dark:text-reply-text-dark rounded-tl-none border border-gray-100 dark:border-reply-border-dark"
                    }
                  `}
                      style={
                        isOutgoing
                          ? { backgroundColor: "#00a884", color: "#ffffff" }
                          : undefined
                      }
                    >
                      {isBot && (
                        <div className="text-[10px] text-white/80 font-bold mb-1 flex items-center gap-1">
                          ï¿½ï¿½ Agente IA
                        </div>
                      )}

                      {/* Attachment Render */}
                      {msg.attachment && (
                        <div className="mb-2 mt-1">
                          {msg.attachment.type === "image" ? (
                            <img
                              src={
                                msg.attachment.url?.startsWith("http") ||
                                msg.attachment.url?.startsWith("data:") ||
                                msg.attachment.url?.startsWith("blob:")
                                  ? msg.attachment.url
                                  : `${BASE_URL}${msg.attachment.url || ""}`
                              }
                              alt="Adjunto"
                              onClick={() => {
                                if (msg.attachment?.url) {
                                  setSelectedImage(
                                    msg.attachment.url.startsWith("http") ||
                                      msg.attachment.url.startsWith("data:") ||
                                      msg.attachment.url.startsWith("blob:")
                                      ? msg.attachment.url
                                      : `${BASE_URL}${msg.attachment.url}`,
                                  );
                                }
                              }}
                              className="rounded-lg max-h-64 object-cover border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                            />
                          ) : msg.attachment.type === "video" ? (
                            <video
                              src={
                                msg.attachment.url?.startsWith("http") ||
                                msg.attachment.url?.startsWith("data:") ||
                                msg.attachment.url?.startsWith("blob:")
                                  ? msg.attachment.url
                                  : `${BASE_URL}${msg.attachment.url || ""}`
                              }
                              controls
                              className="rounded-lg max-h-64 border border-white/20"
                            />
                          ) : msg.attachment.type === "audio" ? (
                            <div
                              className={
                                isAgent
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 rounded-lg"
                                  : "bg-gray-100 dark:bg-gray-700/50 rounded-lg"
                              }
                            >
                              <VoiceNotePlayer
                                src={
                                  msg.attachment.url?.startsWith("http") ||
                                  msg.attachment.url?.startsWith("data:") ||
                                  msg.attachment.url?.startsWith("blob:")
                                    ? msg.attachment.url
                                    : `${BASE_URL}${msg.attachment.url || ""}`
                                }
                                variant={isAgent ? "sent" : "received"}
                              />
                            </div>
                          ) : msg.attachment.type === "sticker" ? (
                            <div className="relative group inline-block">
                              <img
                                src={
                                  msg.attachment.url?.startsWith("http") ||
                                  msg.attachment.url?.startsWith("data:") ||
                                  msg.attachment.url?.startsWith("blob:")
                                    ? msg.attachment.url
                                    : `${BASE_URL}${msg.attachment.url || ""}`
                                }
                                alt="Sticker"
                                className="w-32 h-32 object-contain select-none filter drop-shadow-sm"
                                onContextMenu={(e) => {
                                  e.preventDefault(); /* Maybe custom menu later */
                                }}
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (msg.attachment?.url)
                                    handleSaveSticker(msg.attachment.url);
                                }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-white/80 hover:bg-white text-yellow-500 rounded-full p-1 shadow-sm transition-opacity"
                                title="Guardar Sticker"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                </svg>
                              </button>
                            </div>
                          ) : msg.attachment.type === "location" ? (
                            <div className="bg-white/95 dark:bg-gray-800 p-3 rounded-lg min-w-[220px] border border-gray-200 dark:border-gray-600 shadow-sm text-left">
                              <div className="flex items-center gap-2 mb-2 border-b border-gray-100 dark:border-reply-border-dark pb-2">
                                <span className="text-xl"></span>
                                <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                                  Ubicaciï¿½n
                                </span>
                              </div>
                              {(msg.attachment as any).name && (
                                <div className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-0.5">
                                  {(msg.attachment as any).name}
                                </div>
                              )}
                              {(msg.attachment as any).address && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-tight">
                                  {(msg.attachment as any).address}
                                </div>
                              )}

                              <a
                                href={`https://maps.google.com/?q=${(msg.attachment as any).latitude},${(msg.attachment as any).longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm"
                              >
                                <svg
                                  className="w-3 h-3"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                Ver en Google Maps
                              </a>
                            </div>
                          ) : msg.attachment.type === "contact" ? (
                            <div className="bg-white/95 dark:bg-gray-800 p-3 rounded-lg min-w-[250px] flex items-center gap-3 border border-gray-200 dark:border-gray-600 shadow-sm text-left">
                              <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center text-2xl"></div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">
                                  {(msg.attachment as any).displayName ||
                                    "Contacto"}
                                </div>
                                <div className="text-xs text-blue-500 dark:text-blue-400 cursor-pointer hover:underline mt-0.5 flex items-center gap-1">
                                  VCard Adjunto
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-black/10 p-2 rounded flex items-center gap-2">
                              <span className="text-2xl"></span>
                              <span className="text-xs font-medium underline truncate max-w-[150px]">
                                {msg.attachment.name || "Documento"}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Message Content - Hide redundant filenames for audios */}
                      {/* Message Content - Hide redundant filenames or placeholders */}
                      {msg.content &&
                        // 100-Year Solution: Robust Regex to hide all media placeholders (Case Insensitive)
                        !/^\[(image|video|audio|record|document|sticker)\]$/i.test(
                          msg.content.trim(),
                        ) &&
                        // Also hide if content is just the type name (e.g. "image", "video")
                        ![
                          "image",
                          "video",
                          "audio",
                          "record",
                          "document",
                          "sticker",
                        ].includes(msg.content.trim().toLowerCase()) &&
                        !msg.content.includes("Imagen adjunta") &&
                        !msg.content.includes("Ubicació³n compartida") &&
                        !(
                          msg.content.includes("Contacto:") &&
                          msg.attachment?.type === "contact"
                        ) &&
                        !(
                          msg.attachment && msg.content === msg.attachment.name
                        ) &&
                        !(
                          msg.attachment &&
                          msg.content === `Archivo: ${msg.attachment.name}`
                        ) &&
                        !(
                          msg.attachment?.type === "audio" &&
                          (msg.content.includes("Archivo:") ||
                            msg.content.includes("voice-note") ||
                            msg.content.includes("Nota de voz"))
                        ) &&
                        (() => {
                          const content = msg.content;
                          // Special Renderers
                          if (
                            content.includes("MENSAJE PROGRAMADO:") ||
                            ["SCHEDULED", "scheduled", "pending"].includes(
                              msg.status || "",
                            )
                          ) {
                            let realMsg = content;
                            let dateDisplay = "Programado";

                            if (content.includes("MENSAJE PROGRAMADO:")) {
                              // Optimistic Format
                              const lines = content.split("\n\n");
                              realMsg = lines[1] || "";
                              dateDisplay =
                                lines[2]
                                  ?.replace("Para: ", "")
                                  .replace(" ", "") || "";
                            } else {
                              // Persisted DB Format
                              realMsg = content;
                              if (msg.metadata?.scheduledAt) {
                                try {
                                  dateDisplay = new Date(
                                    msg.metadata.scheduledAt,
                                  ).toLocaleString();
                                } catch (e) {
                                  console.error("Date parse error", e);
                                }
                              }
                            }

                            return (
                              <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 my-1 relative overflow-hidden">
                                {/* Background Pattern */}
                                <div className="absolute -right-6 -top-6 text-amber-100 dark:text-amber-900/20 opacity-50">
                                  <svg
                                    className="w-24 h-24"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                                  </svg>
                                </div>

                                <div className="relative z-10">
                                  <div className="flex items-center gap-2 mb-3 border-b border-amber-200 dark:border-amber-800 pb-2">
                                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse" />
                                    <h4 className="font-bold text-amber-800 dark:text-amber-200 text-xs uppercase tracking-wide">
                                      Mensaje Programado
                                    </h4>
                                  </div>
                                  <p className="text-gray-800 dark:text-gray-200 font-medium text-sm italic mb-3">
                                    "{realMsg}"
                                  </p>
                                  <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded w-fit">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span className="font-semibold">
                                      {dateDisplay}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          if (content.includes(" *SOLICITUD DE PAGO*")) {
                            return (
                              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm my-1 min-w-[200px] border border-gray-100 dark:border-gray-600">
                                <div className="flex items-center gap-2 mb-3 border-b border-gray-100 dark:border-reply-border-dark pb-2">
                                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                                    <CreditCard className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                      Solicitud de Pago
                                    </div>
                                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                                      Reply Pay
                                    </div>
                                  </div>
                                </div>
                                <div className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300 mb-4">
                                  {content
                                    .replace(" *SOLICITUD DE PAGO*", "")
                                    .split("")[0]
                                    .trim()}
                                </div>
                                <button
                                  onClick={() =>
                                    window.open(
                                      `https://buy.stripe.com/test_token?amount=${content.replace(" *SOLICITUD DE PAGO*", "").split("Total:")[1]?.split("\n")[0]?.replace("$", "").trim() || "29.99"}`,
                                      "_blank",
                                    )
                                  }
                                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm transition-colors shadow-sm active:scale-95 transform"
                                >
                                  Pagar Ahora
                                </button>
                              </div>
                            );
                          }
                          if (content.includes(" *SOLICITUD DE DATOS*")) {
                            return (
                              <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded-lg border border-teal-100 dark:border-teal-800 my-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <FileText className="w-5 h-5 text-teal-600" />
                                  <span className="font-bold text-teal-800 dark:text-teal-200">
                                    Datos Requeridos
                                  </span>
                                </div>
                                <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                                  {content
                                    .replace(" *SOLICITUD DE DATOS*", "")
                                    .trim()}
                                </div>
                              </div>
                            );
                          }

                          // Default Text
                          return (
                            <div className="whitespace-pre-wrap leading-relaxed">
                              {content}
                            </div>
                          );
                        })()}
                      <div
                        className={`flex justify-end items-center gap-1 mt-1 text-[10px] ${isOutgoing ? "text-white/70" : "text-gray-400"}`}
                      >
                        <span>
                          {(() => {
                            try {
                              const date = new Date(msg.timestamp);
                              return isNaN(date.getTime())
                                ? ""
                                : new Intl.DateTimeFormat("es-ES", {
                                    hour: "numeric",
                                    minute: "numeric",
                                    hour12: true,
                                  }).format(date);
                            } catch (e) {
                              return "";
                            }
                          })()}
                        </span>
                        {isOutgoing && <CheckCheck className="w-3 h-3" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {(isTyping || isRemoteTyping) && (
                <div className="flex justify-start animate-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-white dark:bg-reply-panel-dark px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 dark:border-reply-border-dark flex items-center gap-2">
                    <div className="flex gap-1">
                      <span
                        className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                        style={{ animationDuration: "0.6s" }}
                      ></span>
                      <span
                        className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                        style={{
                          animationDuration: "0.6s",
                          animationDelay: "0.15s",
                        }}
                      ></span>
                      <span
                        className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                        style={{
                          animationDuration: "0.6s",
                          animationDelay: "0.3s",
                        }}
                      ></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Agents Typing Indicator */}
              {otherAgentsTyping.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-xl rounded-tl-none shadow-sm border border-blue-100 dark:border-blue-800">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
                        <span
                          className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        ></span>
                        <span
                          className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></span>
                      </div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        {otherAgentsTyping.map((a) => a.agentName).join(", ")}{" "}
                        {otherAgentsTyping.length === 1 ? "estï¿½" : "estï¿½n"}{" "}
                        escribiendo...
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* âœ… LEVEL 3C: Input Area - flex-shrink-0 */}
          {readOnly ? (
            <div className="bg-gray-100 dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-reply-border-dark text-center flex-shrink-0">
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                ï¿½ï¿½ El chat estï¿½ en modo solo lectura.
              </p>
            </div>
          ) : (
            <div className="relative flex-shrink-0">
              {showQuickReplies && (
                <QuickReplies
                  onSelect={(text) => {
                    setInputValue(text);
                    setShowQuickReplies(false);
                  }}
                  onClose={() => setShowQuickReplies(false)}
                />
              )}

              {/* Audio Recorder */}
              {isRecording && (
                <div className="absolute bottom-0 left-0 right-0 z-[120] bg-white dark:bg-reply-panel-dark border-t border-gray-200 dark:border-reply-border-dark">
                  <AudioRecorder
                    onSend={handleVoiceNoteSend}
                    onCancel={() => {
                      setIsRecording(false);
                      //  Stop recording status
                      const remoteId =
                        (activeContact as any).phone || activeContact.channelId;
                      if (remoteId) {
                        socketService.emit("conversation:typing", {
                          to: remoteId,
                          status: "paused",
                        });
                      }
                    }}
                  />
                </div>
              )}

              {showStickerPicker && (
                <StickerPicker
                  onSelect={handleStickerSelect}
                  onEmojiSelect={(emoji) =>
                    setInputValue((prev) => prev + emoji.emoji)
                  }
                  onClose={() => setShowStickerPicker(false)}
                />
              )}

              {/* ? SLASH COMMAND MENU */}
              {showSlashMenu && (
                <div className="absolute bottom-full left-0 w-full mb-2 bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl border border-gray-200 dark:border-reply-border-dark overflow-hidden z-[100] animate-in slide-in-from-bottom-2">
                  <div className="bg-reply-bg dark:bg-reply-surface-dark px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                    <span>Comandos Rï¿½pidos</span>
                    <button
                      onClick={() => setShowSlashMenu(false)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto scrollbar-thin">
                    {slashFiltered.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center italic">
                        No hay coincidencias
                      </div>
                    ) : (
                      slashFiltered.map((qr) => (
                        <button
                          key={qr.id}
                          onClick={() => {
                            setInputValue(qr.content);
                            setShowSlashMenu(false);
                            // Optional: Focus input if lost
                          }}
                          className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-[#2a3942] border-b border-gray-100 dark:border-reply-border-dark last:border-0 transition-colors group"
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-bold text-sm text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              /{qr.title}
                            </span>
                            <span className="text-[10px] bg-gray-200 dark:bg-gray-700 px-1.5 rounded text-gray-500">
                              Fast
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {qr.content}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <SmartComposer
                inputValue={inputValue}
                onInputChange={(value) => {
                  setInputValue(value);
                  handleTypingIndicator();

                  // ? SLASH LOGIC
                  if (value.startsWith("/")) {
                    const query = value.slice(1).toLowerCase();
                    const matches = quickRepliesData.filter(
                      (r) =>
                        r.title.toLowerCase().includes(query) ||
                        r.shortcut?.toLowerCase().includes(query),
                    );
                    setSlashFiltered(matches);
                    setShowSlashMenu(true);
                  } else {
                    setShowSlashMenu(false);
                  }
                }}
                onSend={handleSendMessage}
                onQuickRepliesClick={() =>
                  setShowQuickReplies(!showQuickReplies)
                }
                onMediaLibraryClick={() => setShowMediaLibrary(true)}
                onAttachmentClick={() => fileInputRef.current?.click()}
                onVoiceNoteClick={() => {
                  setIsRecording(true);
                  //  Emit 'recording' status
                  const remoteId =
                    (activeContact as any).phone || activeContact.channelId;
                  if (remoteId) {
                    socketService.emit("conversation:typing", {
                      to: remoteId,
                      status: "recording",
                    });
                  }
                }}
                onStickerClick={() => setShowStickerPicker(!showStickerPicker)}
                // âœ… Action Menu Handlers
                onSchedule={() => setActionModalType("SCHEDULE")}
                onProduct={() => setActionModalType("PRODUCT")}
                onRequestData={() => setActionModalType("DATA")}
                onPayment={() => setActionModalType("PAYMENT")}
                selectedFile={selectedFile}
                onClearFile={() => setSelectedFile(null)}
                onAICopilotClick={async (action) => {
                  const context = messages
                    .slice(-15)
                    .map(
                      (m: any) =>
                        `[${m.direction === "inbound" ? "CLIENTE" : "AGENTE"}]: ${typeof m.content === "object" ? m.content.body || JSON.stringify(m.content) : m.content}`,
                    )
                    .join("\n");

                  const text = inputValue;

                  if (action === "formal" && !text.trim()) {
                    toast.error(
                      "Escribe un borrador primero para hacerlo formal.",
                    );
                    return;
                  }

                  const toastId = toast.loading(" IA procesando...");

                  try {
                    const token = localStorage.getItem("token");
                    const res = await fetch(`${API_BASE_URL}/ai/copilot`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ action, text, context }),
                    });
                    const data = await res.json();

                    if (res.ok && data.status === "success") {
                      toast.dismiss(toastId);
                      if (action === "summarize") {
                        setInputValue(` **RESUMEN IA:**\n\n${data.response}`);
                        toast.success("Resumen generado");
                      } else {
                        setInputValue(data.response);
                        toast.success("Sugerencia aplicada");
                      }
                    } else {
                      toast.dismiss(toastId);
                      if (res.status === 503 || res.status === 400) {
                        toast.error(data.message);
                      } else {
                        toast.error("Error al generar respuesta IA");
                      }
                    }
                  } catch (e) {
                    toast.dismiss(toastId);
                    toast.error("Error de conexiï¿½n con IA");
                    console.error(e);
                  }
                }}
                disabled={false}
                isRecording={isRecording}
              />
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
          />
        </div>
        {/* âœ… END MAIN CHAT AREA (LEVEL 2) */}

        {/* âœ… LEVEL 2: Sidebar Derecho (Customer 360) - Responsive Overlay */}
        <div
          className={`
          transition-all duration-300 ease-in-out flex flex-col
          ${isCustomer360Visible ? "translate-x-0" : "translate-x-full md:translate-x-0 md:w-0 md:hidden"}
          fixed top-16 inset-x-0 bottom-0 z-30 w-full bg-white dark:bg-reply-bg-dark md:static md:w-auto md:bg-transparent md:flex-shrink-0
      `}
        >
          {isCustomer360Visible && (
            <div className="flex-1 overflow-hidden md:w-96">
              <Customer360Panel
                contact={displayContact}
                onEditContact={() => setShowContactEditModal(true)}
                onCreateTask={() => {
                  setActivityModalType("TASK");
                  setShowActivityModal(true);
                }}
                onScheduleMeeting={() => {
                  setActivityModalType("MEETING");
                  setShowActivityModal(true);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox Modal */}
      {selectedImage &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setSelectedImage(null)}
          >
            <div
              className="relative max-w-7xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedImage}
                alt="Full preview"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              <div className="flex gap-4 mt-4">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const token = localStorage.getItem("token");
                      const headers: HeadersInit = token
                        ? { Authorization: `Bearer ${token}` }
                        : {};

                      const response = await fetch(selectedImage!, { headers });
                      if (!response.ok) throw new Error("Network error");

                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      // Extract specific filename or fallback
                      const filename =
                        selectedImage!.split("/").pop() ||
                        `download-${Date.now()}`;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch (error) {
                      console.error("Download failed:", error);
                      toast.error(
                        "No se pudo descargar el archivo de forma segura.",
                      );
                      // Vulnerability Mitigation: Do NOT use window.open as fallback
                    }
                  }}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full transition-colors backdrop-blur-sm cursor-pointer"
                >
                  <Download className="w-5 h-5" />
                  Guardar
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full transition-colors backdrop-blur-sm"
                >
                  Cerrar
                </button>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 text-white/50 hover:text-white p-2"
              >
                <X className="w-8 h-8" />
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Media Library Modal */}
      {showMediaLibrary && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-reply-bg-dark w-full max-w-6xl h-[80vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <MediaLibrary
              onSelect={handleMediaSelect}
              onClose={() => setShowMediaLibrary(false)}
            />
          </div>
        </div>
      )}

      {/* Participants Panel (Right Sidebar) */}
      {showParticipantsPanel && activeContact.isGroup && (
        <GroupParticipantsPanel
          conversationId={activeContact.id}
          onClose={() => setShowParticipantsPanel(false)}
        />
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <TransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onTransfer={handleTransferSubmit}
          currentUserId={(() => {
            try {
              const token = localStorage.getItem("token");
              if (token) {
                const decoded = jwtDecode<{ id?: string; userId?: string }>(
                  token,
                );
                return decoded.id || decoded.userId;
              }
            } catch (e) {
              console.error("[ChatInterface] Error decoding token:", e);
            }
            return undefined;
          })()}
        />
      )}

      {/* Success Modal */}
      {transferSuccess && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
          <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl max-w-sm w-full p-8 transform transition-all scale-100 border border-gray-100 dark:border-reply-border-dark text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              ï¿½Transferencia Exitosa!
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8 text-base">
              El ticket ha sido transferido correctamente.
            </p>
            <button
              onClick={() => {
                setTransferSuccess(false);
                if (onBack) onBack();
              }}
              className="w-full bg-reply-green hover:bg-reply-green-dark text-white font-medium py-3.5 px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-reply-green/20"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      <ContactEditModal
        isOpen={showContactEditModal}
        onClose={() => setShowContactEditModal(false)}
        contact={displayContact}
        onSuccess={(updated) => {
          // Preserve local ID if needed, but ensure realContactId is valid
          setDisplayContact((prev) => ({
            ...prev,
            ...updated,
            realContactId: updated.id, // Ensure UUID is mapped here
          }));
          setContactTags(updated.tags || []);
          if (onContactUpdate) onContactUpdate(updated);
        }}
      />

      {/* CRM Modals (Rapid Actions) */}
      {showActivityModal && (
        <ActivityModal
          isOpen={showActivityModal}
          onClose={() => setShowActivityModal(false)}
          onSave={() => {
            setShowActivityModal(false);
            toast.success(
              activityModalType === "TASK"
                ? "Tarea creada"
                : "Reuniï¿½n agendada",
            );
          }}
          initialType={activityModalType}
          preselectedContact={
            displayContact
              ? {
                  id: displayContact.id,
                  name: displayContact.name,
                  email: displayContact.email,
                  companyId: displayContact.companyId,
                  isCompany: false,
                }
              : undefined
          }
        />
      )}

      {showDealModal && (
        <DealModal
          isOpen={showDealModal}
          onClose={() => setShowDealModal(false)}
          onSave={() => {
            setShowDealModal(false);
            toast.success("Oportunidad creada");
          }}
        />
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <EmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          contactEmail={displayContact.email || ""}
          contactId={displayContact.realContactId}
        />
      )}

      {/* Resolve Modal - Enterprise Edition */}
      <ResolveTicketModal
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        onResolve={handleResolveTicket}
        isResolving={isResolving}
      />
      <ActionModals
        type={actionModalType}
        onClose={() => setActionModalType(null)}
        onSchedule={handleScheduleConfirm}
        onProduct={handleProductSelect}
        onPayment={handlePaymentCreate} // Check if handlePaymentCreate exists
        onRequestData={handleDataRequestSelect} // Check if handleDataRequestSelect exists
      />

      {/* Hidden File Input */}
      <div className="hidden">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        />
      </div>
    </>
  );
};
