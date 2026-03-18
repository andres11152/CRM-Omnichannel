import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from "react";
import { debounce } from "lodash";
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

const isNewDay = (prevDate: string | Date | undefined, currDate: string | Date | undefined) => {
  if (!currDate || isNaN(new Date(currDate).getTime())) return false; // 🛡️ Fix: Don't show divider for invalid current dates
  if (!prevDate || isNaN(new Date(prevDate).getTime())) return true;
  const d1 = new Date(prevDate);
  const d2 = new Date(currDate);
  return d1.toDateString() !== d2.toDateString();
};

const DateDivider: React.FC<{ timestamp: string | Date }> = ({ timestamp }) => {
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();

    if (isNaN(d.getTime())) return "Fecha desconocida";

    // Normalize dates to midnight for comparison
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayDate = new Date(nowDate);
    yesterdayDate.setDate(nowDate.getDate() - 1);

    if (dDate.getTime() === nowDate.getTime()) return "Hoy";
    if (dDate.getTime() === yesterdayDate.getTime()) return "Ayer";

    const diffTime = nowDate.getTime() - dDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 7 && diffDays > 0) {
      return d
        .toLocaleDateString("es-ES", { weekday: "long" })
        .replace(/^\w/, (c) => c.toUpperCase());
    }

    return d.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex items-center justify-center my-3 sticky top-2 z-10 pointer-events-none">
      <div className="bg-gray-100/80 dark:bg-[#1f2c34]/80 backdrop-blur-sm px-3 py-1 rounded border-transparent dark:border-white/5 shadow-sm text-[10.5px] text-gray-500 dark:text-gray-400 font-medium pointer-events-auto leading-none">
        {formatDate(timestamp)}
      </div>
    </div>
  );
};

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
  onTicketUpdate?: (ticketId: string, updates: Record<string, unknown>) => void;
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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isRemoteTyping, setIsRemoteTyping] = useState(false); // ? Added
  const [sentiment, setSentiment] = useState<string>("Neutral");
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  /* New State for Dynamic SLA Timer */
  const [lastInteraction, setLastInteraction] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  // Action Modals State
  const [actionModalType, setActionModalType] = useState<
    "SCHEDULE" | "PRODUCT" | "PAYMENT" | "DATA" | null
  >(null);

  // Local state for contact display to support immediate updates
  const [displayContact, setDisplayContact] = useState<Contact>(activeContact);

  /**
   * 🚀 100-YEAR FIX: Scroll to origin message when clicking a quote
   * Includes brief visual highlighting to guide the user
   */
  const scrollToMessage = useCallback((messageId: string) => {
    if (!messageId) return;

    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });

      element.classList.add("ring-2", "ring-indigo-500", "ring-offset-4");
      element.classList.add("scale-[1.02]");

      setTimeout(() => {
        element.classList.remove("ring-2", "ring-indigo-500", "ring-offset-4");
        element.classList.remove("scale-[1.02]");
      }, 1500);
    } else {
      toast.info("No se encontrï¿½ el mensaje original (puede ser antiguo)");
    }
  }, []);

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

  // New Features-EState
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

  // 🛡️ REFACTORED CONVERSATION LOADER
  const fetchConversation = useCallback(async () => {
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
          (p: { role: string; id: string }) => p.role === "USER",
        )?.id;

        // Map backend messages to frontend format
        const history = conv.messages.map(
          (
            m: {
              id: string;
              direction?: string;
              content?: string;
              createdAt?: string | Date;
              timestamp?: string | Date;
              senderId?: string;
              sender?: { role?: string; email?: string; name?: string };
              metadata?: {
                aiGenerated?: boolean;
                media?: unknown;
                mediaType?: string;
                mediaFilename?: string;
                attachment?: unknown;
                source?: string;
                reaction?: string;
              };
              attachment?: unknown;
              reactions?: { reactBy: string; content: string }[];
            },
            index: number,
          ) => {
            let type = SenderType.AGENT;
            const dir = (m.direction || "").toUpperCase();

            if (m.metadata?.aiGenerated) {
              type = SenderType.AGENT;
            } else if (dir === "INBOUND") {
              type = SenderType.USER;
            } else if (dir === "OUTBOUND") {
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

            // 🛡️ HISTORY SYNC: Synthetic attachment placeholder
            const rawContent = m.content || "";
            const existingAttachment =
              m.metadata?.media || m.attachment || m.metadata?.attachment;
            let syntheticAttachment: Record<string, string> | null = null;
            if (!existingAttachment) {
              // 🚀 PRIMARY: Use metadata.mediaType stored by backend sync
              const mediaType = m.metadata?.mediaType as string | undefined;
              if (mediaType) {
                const mediaTypeMap: Record<
                  string,
                  { type: string; name: string }
                > = {
                  image: { type: "image_unavailable", name: "Imagen" },
                  video: { type: "video_unavailable", name: "Video" },
                  audio: { type: "audio_unavailable", name: "Nota de voz" },
                  document: {
                    type: "document_unavailable",
                    name: (m.metadata?.mediaFilename as string) || "Documento",
                  },
                  sticker: { type: "image_unavailable", name: "Sticker" },
                  contact: { type: "document_unavailable", name: "Contacto" },
                  location: { type: "document_unavailable", name: "Ubicación" },
                };
                const mapped = mediaTypeMap[mediaType];
                if (mapped) {
                  syntheticAttachment = {
                    type: mapped.type,
                    name: mapped.name,
                  };
                }
              }
              // 🛡️ FALLBACK: Regex for legacy messages synced before mediaType was stored
              if (!syntheticAttachment && rawContent) {
                const lc = rawContent.trim().toLowerCase();
                const stripped = lc
                  .replace(/[\[\]\s📷🎬🎤📄📎]/gu, "")
                  .toLowerCase();

                const isImagePlaceholder =
                  /imagen|imagem|image|foto|photo/.test(stripped) &&
                  rawContent.length < 50;
                const isVideoPlaceholder =
                  /video|vídeo/.test(stripped) && rawContent.length < 50;
                const isAudioPlaceholder =
                  /audio|voz|voice|nota.*voz|voice.*note|ogg|m4a|opus/.test(
                    stripped,
                  ) && rawContent.length < 50;
                const isDocPlaceholder =
                  /doc|documento|pdf|archivo|sticker|\\.(pdf|doc|docx|xls|xlsx|ppt|zip)/.test(
                    stripped,
                  ) ||
                  rawContent
                    .trim()
                    .match(/\.(pdf|docx?|xlsx?|pptx?|zip|rar)$/i) !== null;

                if (isImagePlaceholder)
                  syntheticAttachment = {
                    type: "image_unavailable",
                    name: "Imagen",
                  };
                else if (isVideoPlaceholder)
                  syntheticAttachment = {
                    type: "video_unavailable",
                    name: "Video",
                  };
                else if (isAudioPlaceholder)
                  syntheticAttachment = {
                    type: "audio_unavailable",
                    name: "Nota de voz",
                  };
                else if (isDocPlaceholder)
                  syntheticAttachment = {
                    type: "document_unavailable",
                    name:
                      rawContent.replace(/[[\]📄📷🎬🎤📎]/gu, "").trim() ||
                      "Documento",
                  };
              }
            }

            return {
              id: m.id,
              ticketId: activeContact.id,
              companyId: activeContact.companyId,
              content: m.content,
              senderType: type,
              timestamp: m.createdAt || m.timestamp || new Date(),
              senderName:
                m.sender?.name ||
                (type === SenderType.USER ? activeContact.name : "You"),
              attachment:
                existingAttachment || syntheticAttachment || undefined,
              metadata: m.metadata,
              // ❤️ FIX: Include reactions from backend (Prisma include)
              reactions: m.reactions && m.reactions.length > 0
                ? m.reactions
                : undefined,
            };
          },
        );

        const sortedHistory = history.sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            new Date(a.timestamp as string | number | Date).getTime() -
            new Date(b.timestamp as string | number | Date).getTime(),
        );

        setMessages(
          sortedHistory.filter(
            (m: Record<string, unknown>) => m.id,
          ) as Message[],
        );

        if (conv.tags && Array.isArray(conv.tags)) {
          setContactTags(conv.tags);
          setDisplayContact((prev) => ({ ...prev, tags: conv.tags }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch history", error);
    }
  }, [activeContact.id, activeContact.companyId, activeContact.name]);

  // 🔄 MANUAL SYNC HANDLER
  const handleSyncHistory = async () => {
    if (isSyncing) return;

    try {
      const sanitizedPhone = activeContact.channelId?.replace(/\D/g, "");
      if (!sanitizedPhone) {
        toast.error("No se encontró un número de teléfono para sincronizar.");
        return;
      }

      setIsSyncing(true);
      const toastId = toast.loading("🔄 Sincronizando historial extendido desde WhatsApp...");

      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE_URL}/whatsapp/sync/conversation/${sanitizedPhone}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ limit: 500 }), // 🚀 Extended limit: up to 500 messages
        },
      );

      const data = await res.json();
      if (data.status === "success") {
        toast.dismiss(toastId);
        const synced = data.data.synced ?? 0;
        const totalFound = data.data.totalFound ?? 0;
        if (synced > 0) {
          toast.success(
            `✅ ${synced} mensajes nuevos cargados (${totalFound} encontrados en historial).`,
            { duration: 5000 },
          );
        } else {
          toast.info(
            `ℹ️ Ya estás al día. No hay mensajes nuevos en el historial.`,
            { duration: 4000 },
          );
        }
        fetchConversation();
      } else {
        throw new Error(data.message || "Error al sincronizar");
      }
    } catch (error: unknown) {
      toast.dismiss();
      toast.error(
        `Error: ${error instanceof Error ? error.message : "Desconocido"}`,
      );
    } finally {
      setIsSyncing(false);
    }
  };

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
  // Load initial history & tags
  useEffect(() => {
    fetchConversation();
    setContactTags(activeContact.tags || []);
    setSentiment("Neutral");
    setIsCopied(false);

    if (activeContact.lastMessageTime) {
      setLastInteraction(new Date(activeContact.lastMessageTime));
    } else {
      setLastInteraction(new Date());
    }
  }, [fetchConversation, activeContact.tags, activeContact.lastMessageTime]);

  // Socket Listener
  useEffect(() => {
    let isActiveContext = true;
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
        timestamp:
          msg.timestamp ||
          ((msg as unknown as Record<string, unknown>).createdAt as
            | string
            | Date) ||
          new Date(),
        // Normalize senderType based on direction
        senderType:
          msg.senderType ||
          ((msg as unknown as Record<string, unknown>).direction === "OUTBOUND"
            ? SenderType.AGENT
            : SenderType.USER),
        companyId: msg.companyId || activeContact.companyId,
        // 🛡️ FIX: Map attachment from metadata.media (matches history loading logic)
        // Without this, Socket.IO replaces the optimistic message and the image disappears.
        attachment:
          msg.attachment ||
          (
            msg as unknown as {
              metadata?: {
                media?: Message["attachment"];
                attachment?: Message["attachment"];
              };
            }
          ).metadata?.media ||
          (
            msg as unknown as {
              metadata?: {
                media?: Message["attachment"];
                attachment?: Message["attachment"];
              };
            }
          ).metadata?.attachment,
      };

      if (isActiveContext) {
        setMessages((prev) => {
          // Check if message already exists (by ID)
          const existingIndex = prev.findIndex((m) => m.id === processedMsg.id);

          if (existingIndex !== -1) {
            return prev;
          }

          //  ATOMIC REPLACEMENT: Find SPECIFIC temp message by content match
          let optimisticIndex = prev.findIndex(
            (m) =>
              m.id &&
              m.id.startsWith("temp-") &&
              m.content?.trim() === processedMsg.content?.trim(),
          );

          if (optimisticIndex === -1) {
            const tempMessages = prev
              .map((m, idx) => ({ ...m, idx }))
              .filter((m) => m.id && m.id.startsWith("temp-"));

            if (tempMessages.length > 0) {
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
      }
    };

    // 2. Define Join Function
    const joinRoom = () => {
      if (!activeContact.id || !isActiveContext) return;

      console.log(
        `[ChatInterface] ï¿½ï¿½ Joining conversation room: ${activeContact.id}`,
      );
      socketService.emit("join_room", { conversationId: activeContact.id });
    };

    // 3. Define Connect/Disconnect Handlers
    const handleConnect = () => {
      if (!isActiveContext) return;
      console.log("[ChatInterface] 📡 Socket Connected");
      setSocketStatus("connected");
      joinRoom(); // Re-join on reconnect
    };

    const handleDisconnect = () => {
      if (!isActiveContext) return;
      console.log("[ChatInterface] 📡 Socket Disconnected");
      setSocketStatus("disconnected");
    };

    /**
     * SYNC HANDLERS
     */
    const handleSyncStarted = (data: { conversationId: string }) => {
      if (data.conversationId === activeContact.id) {
        setIsSyncing(true);
      }
    };

    const handleHistorySynced = (data: {
      conversationId: string;
      channelId?: string;
      newMessages: number;
    }) => {
      if (data.conversationId === activeContact.id) {
        setIsSyncing(false);
        if (data.newMessages > 0) {
          console.log(`[ContextSync] 🚀 ${data.newMessages} messages synced, reloading...`);
          toast.info(`📜 ${data.newMessages} mensajes históricos cargados`);
          fetchConversation();
        }
      }
    };

    // 4. Setup Listeners
    socketService.on("conversation.new_message", handleIncomingMessage);
    socketService.on("connect", handleConnect);
    socketService.on("disconnect", handleDisconnect);
    socketService.on("sync:started", handleSyncStarted);
    socketService.on("conversation:history_synced", handleHistorySynced);

    // 5. Initial Actions
    if (socketService.isConnected) {
      setSocketStatus("connected");
      joinRoom();
    } else {
      socketService.connect();
    }

    // 6. Typing Indicators
    // Moved sync handlers up

    const handleConversationTyping = (data: {

      conversationId: string;
      from: string;
      status: "composing" | "recording" | "paused";
    }) => {
      if (!isActiveContext) return;
      if (
        data.conversationId === activeContact.id ||
        (activeContact.phone && data.from.includes(activeContact.phone)) ||
        (activeContact.channelId && data.from.includes(activeContact.channelId))
      ) {
        if (data.status === "composing" || data.status === "recording") {
          setIsRemoteTyping(true);
          setTimeout(() => {
            if (isActiveContext) setIsRemoteTyping(false);
          }, 10000);
        } else {
          setIsRemoteTyping(false);
        }
      }
    };
    socketService.on("conversation:typing", handleConversationTyping);

    const handleAgentTyping = (data: {
      ticketId: string;
      agentId: string;
      agentName: string;
    }) => {
      if (!isActiveContext) return;
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
      if (!isActiveContext) return;
      if (data.ticketId === activeContact.id) {
        setOtherAgentsTyping((prev) =>
          prev.filter((a) => a.agentId !== data.agentId),
        );
      }
    };
    socketService.on("agent.typing", handleAgentTyping);
    socketService.on("agent.stopped_typing", handleAgentStoppedTyping);

    // 🚀 CONTEXT SYNC: Implementation moved to main sync handlers block

    // 🗑️ MESSAGE REVOCATION: Real-time "Delete for Everyone"
    const handleMessageRevoked = (data: {
      messageId: string;
      conversationId: string;
      content?: string;
      status?: Message["status"];
    }) => {
      if (!isActiveContext) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? {
                ...msg,
                content: data.content || "🚫 Este mensaje fue eliminado",
                status: (data.status || "REVOKED") as Message["status"],
                attachment: undefined,
                metadata: {
                  ...(msg.metadata || {}),
                  revoked: true,
                },
              }
            : msg,
        ),
      );
    };
    socketService.on("message.revoked", handleMessageRevoked);

    // ❤️ MESSAGE REACTIONS: Emojis on bubbles
    const handleMessageReaction = (data: {
      messageId: string;
      conversationId: string;
      reaction: string;
      participant: string;
    }) => {
      if (!isActiveContext) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== data.messageId) return msg;

          let newReactions = [...(msg.reactions || [])];
          if (!data.reaction) {
            // Remove reaction
            newReactions = newReactions.filter(
              (r) => r.reactBy !== data.participant,
            );
          } else {
            // Upsert reaction
            const existingIdx = newReactions.findIndex(
              (r) => r.reactBy === data.participant,
            );
            if (existingIdx !== -1) {
              newReactions[existingIdx].content = data.reaction;
            } else {
              newReactions.push({
                reactBy: data.participant,
                content: data.reaction,
              });
            }
          }

          return { ...msg, reactions: newReactions };
        }),
      );
    };
    socketService.on("message.reaction", handleMessageReaction);

    // 7. Cleanup
    return () => {
      isActiveContext = false;
      console.log(
        `[ChatInterface]  Cleaning up listeners for ${activeContact.id}`,
      );
      socketService.off("conversation.new_message", handleIncomingMessage);
      socketService.off("connect", handleConnect);
      socketService.off("disconnect", handleDisconnect);
      socketService.off("sync:started", handleSyncStarted);
      socketService.off("conversation:history_synced", handleHistorySynced);
      socketService.off("conversation:typing", handleConversationTyping);


      socketService.off("agent.typing", handleAgentTyping);
      socketService.off("agent.stopped_typing", handleAgentStoppedTyping);
      socketService.off("message.revoked", handleMessageRevoked);
      socketService.off("message.reaction", handleMessageReaction);
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
    const quoteContext = replyingTo
      ? {
          quotedMessageId: replyingTo.id,
          quotedContent:
            replyingTo.content ||
            (replyingTo as Message & { attachment?: { name?: string } })
              .attachment?.name ||
            "Mensaje multimedia",
        }
      : {};
    setReplyingTo(null);

    // Prepare attachment promise
    let attachmentPromise: Promise<{
      mediaContent?: string;
      type?: string;
      name?: string;
    }> | null = null;
    let optimisticAttachment: Message["attachment"] | undefined = undefined;

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
        mimeType: fileToSend.type,
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
        mimeType: media.mimeType,
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
      metadata: Object.keys(quoteContext).length > 0 ? quoteContext : undefined,
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
            ...quoteContext,
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
      const lastRun =
        (window as unknown as Record<string, number>)[dedupeKey] || 0;

      if (now - lastRun < 50) {
        console.log(
          "[ChatInterface]  Skipping duplicate reconciliation (< 50ms)",
        );
        return;
      }
      (window as unknown as Record<string, number>)[dedupeKey] = now;

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
                timestamp: serverMsg.timestamp || serverMsg.createdAt || new Date(),
                senderName: "You",
                attachment: finalAttachment,
              }
            : m,
        );
      });
    } catch (error: unknown) {
      console.error("Error sending message:", error);
      toast.error(
        `Error al enviar: ${error instanceof Error ? error.message : "Desconocido"}`,
      );
      setMessages((prev) => prev.filter((m) => m.id !== tempId)); // Rollback
      setInputValue(content);
      setSelectedFile(fileToSend); // Restore file
    }

    // ? UPDATE TIMER ON OUTBOUND
    setLastInteraction(new Date());
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

  const handleProductSelect = async (product: {
    id: string;
    name: string;
    price: number;
    currency?: string;
    description?: string;
    imageUrl?: string;
    stock?: number;
    status?: string;
    companyId?: string;
    createdAt?: string;
    updatedAt?: string;
  }) => {
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

  // ? 100-YEAR PERFORMANCE FIX: Debounce typing indicator to prevent socket flooding
  const debouncedTypingEmit = useMemo(
    () =>
      debounce(
        (remoteId: string) => {
          socketService.emit("conversation:typing", {
            to: remoteId,
            status: "composing",
          });
        },
        2000,
        { leading: true, trailing: false },
      ),
    [],
  );

  const handleTypingIndicator = useCallback(() => {
    const remoteId =
      (activeContact as Contact & { phone?: string }).phone ||
      activeContact.channelId;
    if (!remoteId) return;

    debouncedTypingEmit(remoteId);

    // Clear existing timeout for "paused"
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socketService.emit("conversation:typing", {
        to: remoteId,
        status: "paused",
      });
    }, 3000);
  }, [activeContact.id, debouncedTypingEmit]);

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
    const remoteId =
      (activeContact as Contact & { phone?: string }).phone ||
      activeContact.channelId;
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
        payload as TransferTicketDTO,
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
        status: type === "SPAM" ? "CLOSED" : "RESOLVED",
        resolutionType: type as ResolutionType,
        resolutionNotes: notes,
      });

      toast.success("Ticket resuelto correctamente");
      setShowResolveModal(false);

      if (onBack) onBack();
    } catch (error: unknown) {
      console.error("Resolve failed", error);
      toast.error(
        error instanceof Error ? error.message : "Error al resolver el ticket",
      );
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
              onSyncHistory={handleSyncHistory}
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
                      (s: { status: string; sessionId: string }) =>
                        s.status === "DISCONNECTED",
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
                handleChangePriority(
                  priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
                )
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

          {/* ✅ LEVEL 3B: Chat Messages Area - flex: 1, overflow-y: auto (scroll independiente) */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-reply-bg dark:bg-reply-bg-dark relative">
            {/* 🔄 SYNCING INDICATOR */}
            {isSyncing && (
              <div className="sticky top-0 left-0 right-0 z-50 bg-indigo-600/90 text-white py-1.5 px-4 text-center text-[11px] font-bold backdrop-blur-md flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Sincronizando historial desde WhatsApp...</span>
              </div>
            )}

            <div className="p-3 sm:p-4 space-y-2">

              {useMemo(
                () =>
                  messages.map((msg, index) => {
                    const prevMsg = messages[index - 1];
                    const showDateDivider =
                      !prevMsg || isNewDay(prevMsg.timestamp, msg.timestamp);

                    const isUser =
                      msg.senderType === SenderType.USER &&
                      msg.direction !== "OUTBOUND";
                    const isBot = msg.senderType === SenderType.BOT;
                    const isAgent = msg.senderType === SenderType.AGENT;
                    const isOutgoing =
                      isAgent || isBot || msg.direction === "OUTBOUND";

                    return (
                      <React.Fragment key={`${msg.id}-${index}`}>
                        {showDateDivider && (
                          <DateDivider timestamp={msg.timestamp} />
                        )}
                        <div
                          id={`msg-${msg.id}`}
                          className={`flex ${isOutgoing ? "justify-end" : "justify-start"} mb-1.5 group/msg transition-all duration-300`}
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
                          {/* Quoted Message (Reply) */}
                          {(msg.metadata?.quotedMessageId as string) && (
                            <div
                              onClick={() =>
                                scrollToMessage(
                                  msg.metadata?.quotedMessageId as string,
                                )
                              }
                              className={`mb-2 p-2 rounded-lg border-l-4 bg-black/5 dark:bg-white/5 backdrop-blur-sm cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${isOutgoing ? "border-white/40" : "border-indigo-500"}`}
                            >
                              <div
                                className={`text-[10px] font-bold mb-0.5 ${isOutgoing ? "text-white/80" : "text-indigo-600 dark:text-indigo-400"}`}
                              >
                                {!!(msg.metadata?.quotedContent as string)
                                  ? "Respondiendo a:"
                                  : "Respondiendo a mensaje multimedia"}
                              </div>
                              <div
                                className={`text-xs italic line-clamp-2 ${isOutgoing ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}
                              >
                                {(msg.metadata?.quotedContent as string) ||
                                  "Haga clic para ver el original"}
                              </div>
                            </div>
                          )}

                          {isBot && (
                            <div className="text-[10px] text-white/80 font-bold mb-1 flex items-center gap-1">
                              ï¿½ï¿½ Agente IA
                            </div>
                          )}
                          {/* 🗑️ REVOKED MESSAGE: "Delete for Everyone" */}
                          {Boolean(msg.metadata?.revoked) ? (
                            <div className="flex items-center gap-2 py-1 opacity-70">
                              <svg
                                className="w-4 h-4 opacity-60"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                />
                              </svg>
                              <span className="text-xs italic">
                                Este mensaje fue eliminado
                              </span>
                            </div>
                          ) : (
                            <>
                              {/* Attachment Render */}
                              {msg.attachment && (
                                <div className="mb-2 mt-1">
                                  {msg.attachment.type === "image" ? (
                                    <img
                                      src={
                                        msg.attachment.url?.startsWith(
                                          "http",
                                        ) ||
                                        msg.attachment.url?.startsWith(
                                          "data:",
                                        ) ||
                                        msg.attachment.url?.startsWith("blob:")
                                          ? msg.attachment.url
                                          : `${BASE_URL}${msg.attachment.url || ""}`
                                      }
                                      alt="Adjunto"
                                      onClick={() => {
                                        if (msg.attachment?.url) {
                                          setSelectedImage(
                                            msg.attachment.url.startsWith(
                                              "http",
                                            ) ||
                                              msg.attachment.url.startsWith(
                                                "data:",
                                              ) ||
                                              msg.attachment.url.startsWith(
                                                "blob:",
                                              )
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
                                        msg.attachment.url?.startsWith(
                                          "http",
                                        ) ||
                                        msg.attachment.url?.startsWith(
                                          "data:",
                                        ) ||
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
                                          msg.attachment.url?.startsWith(
                                            "http",
                                          ) ||
                                          msg.attachment.url?.startsWith(
                                            "data:",
                                          ) ||
                                          msg.attachment.url?.startsWith(
                                            "blob:",
                                          )
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
                                          msg.attachment.url?.startsWith(
                                            "http",
                                          ) ||
                                          msg.attachment.url?.startsWith(
                                            "data:",
                                          ) ||
                                          msg.attachment.url?.startsWith(
                                            "blob:",
                                          )
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
                                            handleSaveSticker(
                                              msg.attachment.url,
                                            );
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
                                      {(
                                        msg.attachment as {
                                          name?: string;
                                          address?: string;
                                          latitude?: string | number;
                                          longitude?: string | number;
                                          displayName?: string;
                                        }
                                      ).name && (
                                        <div className="font-bold text-sm text-gray-800 dark:text-gray-100 mb-0.5">
                                          {
                                            (
                                              msg.attachment as {
                                                name?: string;
                                                address?: string;
                                                latitude?: string | number;
                                                longitude?: string | number;
                                                displayName?: string;
                                              }
                                            ).name
                                          }
                                        </div>
                                      )}
                                      {(
                                        msg.attachment as {
                                          name?: string;
                                          address?: string;
                                          latitude?: string | number;
                                          longitude?: string | number;
                                          displayName?: string;
                                        }
                                      ).address && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-tight">
                                          {
                                            (
                                              msg.attachment as {
                                                name?: string;
                                                address?: string;
                                                latitude?: string | number;
                                                longitude?: string | number;
                                                displayName?: string;
                                              }
                                            ).address
                                          }
                                        </div>
                                      )}

                                      <a
                                        href={`https://maps.google.com/?q=${(msg.attachment as { name?: string; address?: string; latitude?: string | number; longitude?: string | number; displayName?: string }).latitude},${(msg.attachment as { name?: string; address?: string; latitude?: string | number; longitude?: string | number; displayName?: string }).longitude}`}
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
                                          {(
                                            msg.attachment as {
                                              name?: string;
                                              address?: string;
                                              latitude?: string | number;
                                              longitude?: string | number;
                                              displayName?: string;
                                            }
                                          ).displayName || "Contacto"}
                                        </div>
                                        <div className="text-xs text-blue-500 dark:text-blue-400 cursor-pointer hover:underline mt-0.5 flex items-center gap-1">
                                          VCard Adjunto
                                        </div>
                                      </div>
                                    </div>
                                  ) : msg.attachment?.type ===
                                    "image_unavailable" ? (
                                    <div className="rounded-xl overflow-hidden border border-white/10 min-w-[200px] max-w-[260px]">
                                      <div className="bg-black/20 dark:bg-black/40 flex flex-col items-center justify-center py-8 px-4 gap-3">
                                        <svg
                                          className="w-12 h-12 opacity-60"
                                          fill="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                        </svg>
                                        <span className="text-xs font-semibold opacity-70">
                                          Imagen
                                        </span>
                                      </div>
                                      {msg.attachment.url ? (
                                        <a
                                          href={msg.attachment.url}
                                          download
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center justify-center gap-2 py-2 bg-black/20 hover:bg-black/30 text-xs font-bold transition-colors"
                                        >
                                          <Download className="w-3.5 h-3.5" />{" "}
                                          Descargar
                                        </a>
                                      ) : (
                                        <div className="flex items-center justify-center py-2 bg-black/10 text-xs opacity-50">
                                          Archivo no disponible en historial
                                        </div>
                                      )}
                                    </div>
                                  ) : msg.attachment?.type ===
                                    "video_unavailable" ? (
                                    <div className="rounded-xl overflow-hidden border border-white/10 min-w-[200px] max-w-[260px]">
                                      <div className="bg-black/20 dark:bg-black/40 flex flex-col items-center justify-center py-8 px-4 gap-3">
                                        <svg
                                          className="w-12 h-12 opacity-60"
                                          fill="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                        </svg>
                                        <span className="text-xs font-semibold opacity-70">
                                          Video
                                        </span>
                                      </div>
                                      {msg.attachment.url ? (
                                        <a
                                          href={msg.attachment.url}
                                          download
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center justify-center gap-2 py-2 bg-black/20 hover:bg-black/30 text-xs font-bold transition-colors"
                                        >
                                          <Download className="w-3.5 h-3.5" />{" "}
                                          Descargar
                                        </a>
                                      ) : (
                                        <div className="flex items-center justify-center py-2 bg-black/10 text-xs opacity-50">
                                          Archivo no disponible en historial
                                        </div>
                                      )}
                                    </div>
                                  ) : msg.attachment?.type ===
                                    "audio_unavailable" ? (
                                    <div className="rounded-xl overflow-hidden border border-white/10 min-w-[200px]">
                                      <div className="flex items-center gap-3 px-4 py-3 bg-black/10 dark:bg-black/30">
                                        <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center flex-shrink-0">
                                          <svg
                                            className="w-5 h-5 opacity-70"
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h3V3h-6z" />
                                          </svg>
                                        </div>
                                        <div className="flex-1">
                                          <div className="text-xs font-bold opacity-80">
                                            Nota de voz
                                          </div>
                                          {msg.attachment.url ? (
                                            <a
                                              href={msg.attachment.url}
                                              download
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-[10px] underline opacity-60 hover:opacity-90 flex items-center gap-1 mt-0.5"
                                            >
                                              <Download className="w-2.5 h-2.5" />{" "}
                                              Descargar audio
                                            </a>
                                          ) : (
                                            <div className="text-[10px] opacity-40 mt-0.5">
                                              No disponible en historial
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ) : msg.attachment?.type ===
                                    "document_unavailable" ? (
                                    <div className="flex items-center gap-3 bg-black/10 dark:bg-black/30 p-3 rounded-xl min-w-[200px] border border-white/10">
                                      <div className="w-10 h-10 rounded-lg bg-blue-500/30 flex items-center justify-center flex-shrink-0 text-xl">
                                        📄
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold truncate opacity-90">
                                          {msg.attachment.name || "Documento"}
                                        </div>
                                        {msg.attachment.url ? (
                                          <a
                                            href={msg.attachment.url}
                                            download
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[10px] underline opacity-70 hover:opacity-100 mt-0.5 transition-opacity"
                                          >
                                            <Download className="w-2.5 h-2.5" />{" "}
                                            Descargar
                                          </a>
                                        ) : (
                                          <div className="text-[10px] opacity-40 mt-0.5">
                                            No disponible en historial
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-3 bg-black/10 dark:bg-black/30 p-3 rounded-xl min-w-[220px] max-w-[320px] border border-white/10">
                                      <div className="w-11 h-11 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                        <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                                        </svg>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold truncate opacity-90">
                                          {msg.attachment.name || "Documento"}
                                        </div>
                                        {msg.attachment.url ? (
                                          <a
                                            href={
                                              msg.attachment.url.startsWith("http") ||
                                              msg.attachment.url.startsWith("data:") ||
                                              msg.attachment.url.startsWith("blob:")
                                                ? msg.attachment.url
                                                : `${BASE_URL}${msg.attachment.url}`
                                            }
                                            download={msg.attachment.name || "documento"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[10px] text-blue-400 underline opacity-80 hover:opacity-100 mt-1 transition-opacity"
                                          >
                                            <Download className="w-3 h-3" />{" "}
                                            Descargar
                                          </a>
                                        ) : (
                                          <div className="text-[10px] opacity-40 mt-0.5">
                                            No disponible
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Message Content - Hide redundant filenames for audios */}
                              {/* Message Content - Hide redundant filenames or placeholders */}
                              {msg.content &&
                                // 🛡️ Hide content when a synthetic 'unavailable' attachment is shown (avoids duplicate placeholder text)
                                !msg.attachment?.type?.endsWith(
                                  "_unavailable",
                                ) &&
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
                                !msg.content.includes(
                                  "Ubicació³n compartida",
                                ) &&
                                !(
                                  msg.content.includes("Contacto:") &&
                                  msg.attachment?.type === "contact"
                                ) &&
                                !(
                                  msg.attachment &&
                                  msg.content === msg.attachment.name
                                ) &&
                                !(
                                  msg.attachment &&
                                  msg.content ===
                                    `Archivo: ${msg.attachment.name}`
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
                                    [
                                      "SCHEDULED",
                                      "scheduled",
                                      "pending",
                                    ].includes(msg.status || "")
                                  ) {
                                    let realMsg = content;
                                    let dateDisplay = "Programado";

                                    if (
                                      content.includes("MENSAJE PROGRAMADO:")
                                    ) {
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
                                            msg.metadata?.scheduledAt as string,
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
                                  if (
                                    content.includes(" *SOLICITUD DE PAGO*")
                                  ) {
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
                                  if (
                                    content.includes(" *SOLICITUD DE DATOS*")
                                  ) {
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
                                            .replace(
                                              " *SOLICITUD DE DATOS*",
                                              "",
                                            )
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
                            </>
                          )}
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

                          {/* ❤️ REACTION DISPLAY */}
                          {msg.reactions && msg.reactions.length > 0 ? (
                            <div
                              className={`absolute -bottom-4 ${isOutgoing ? "right-2" : "left-2"} z-20 flex items-center justify-center bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 rounded-full px-1.5 py-0.5 animate-in zoom-in-50 duration-200 gap-1`}
                            >
                              {msg.reactions.map((react, idx) => (
                                <span
                                  key={idx}
                                  className="text-sm leading-none"
                                  title={`Reaccionó: ${react.reactBy}`}
                                >
                                  {react.content}
                                </span>
                              ))}
                            </div>
                          ) : (
                            // Legacy fallback
                            Boolean(msg.metadata?.reaction) && (
                              <div
                                className={`absolute -bottom-4 ${isOutgoing ? "right-2" : "left-2"} z-20 flex items-center justify-center bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 rounded-full px-1.5 py-0.5 animate-in zoom-in-50 duration-200`}
                                title={`Reaccionó: ${(msg.metadata?.reaction as string) || ""}`}
                              >
                                <span className="text-sm leading-none">
                                  {(msg.metadata?.reaction as string) || ""}
                                </span>
                              </div>
                            )
                          )}
                        </div>

                        {/* Reply Button Action (on hover) */}
                        <div
                          className={`flex items-center opacity-0 group-hover/msg:opacity-100 transition-opacity px-2 ${isOutgoing ? "order-first" : "order-last"}`}
                        >
                          <button
                            onClick={() => setReplyingTo(msg)}
                            className="p-1.5 bg-white dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full shadow-md border border-gray-100 dark:border-gray-600 transition-all active:scale-90"
                            title="Responder"
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
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                }),
                [messages, activeContact.name, scrollToMessage],
              )}
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
                        {otherAgentsTyping.length === 1
                          ? "estáï¿½"
                          : "estáï¿½n"}{" "}
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
                ï¿½ï¿½ El chat estáï¿½ en modo solo lectura.
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
                        (activeContact as Contact & { phone?: string }).phone ||
                        activeContact.channelId;
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
                onInputChange={useCallback(
                  (value: string) => {
                    setInputValue(value);
                    handleTypingIndicator();

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
                  },
                  [handleTypingIndicator, quickRepliesData],
                )}
                onSend={handleSendMessage}
                onQuickRepliesClick={useCallback(
                  () => setShowQuickReplies((prev) => !prev),
                  [],
                )}
                onMediaLibraryClick={useCallback(
                  () => setShowMediaLibrary(true),
                  [],
                )}
                onAttachmentClick={useCallback(
                  () => fileInputRef.current?.click(),
                  [],
                )}
                onVoiceNoteClick={useCallback(() => {
                  setIsRecording(true);
                  const remoteId =
                    (activeContact as Contact & { phone?: string }).phone ||
                    activeContact.channelId;
                  if (remoteId) {
                    socketService.emit("conversation:typing", {
                      to: remoteId,
                      status: "recording",
                    });
                  }
                }, [activeContact])}
                onStickerClick={useCallback(
                  () => setShowStickerPicker((prev) => !prev),
                  [],
                )}
                replyingTo={useMemo(
                  () =>
                    replyingTo
                      ? {
                          id: replyingTo.id,
                          content: replyingTo.content,
                          senderName:
                            replyingTo.senderType === SenderType.USER
                              ? activeContact.name
                              : replyingTo.senderName || "Agente",
                        }
                      : null,
                  [replyingTo, activeContact],
                )}
                onClearReply={useCallback(() => setReplyingTo(null), [])}
                // ✅ Action Menu Handlers
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
                      (m: Message & { direction?: string }) =>
                        `[${m.direction === "INBOUND" ? "CLIENTE" : "AGENTE"}]: ${typeof m.content === "object" ? (m.content as Record<string, unknown>).body || JSON.stringify(m.content) : m.content}`,
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
//
