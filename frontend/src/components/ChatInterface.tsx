import React, { 
  useState, 
  useCallback, 
  useEffect, 
  useMemo, 
  memo,
  useRef
} from "react";
import { 
  Contact,
  Message, 
  AIConfig, 
  SenderType,
  QuickReply,
} from "@/types";
import { jwtDecode } from "jwt-decode";
import { useSocketStore } from "@/stores/socketStore";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Separate Components
import { ChatHeader } from "./chat/ChatHeader";
import { MessageStream } from "./chat/MessageStream";
import { ChatComposer } from "./chat/ChatComposer";
import { Customer360Panel } from "./Customer360Panel";
import { TagsNavbar } from "./chat/TagsNavbar";
import { GroupParticipantsPanel } from "./GroupParticipantsPanel";
import { ContactEditModal } from "./ContactEditModal";
import { TransferModal } from "./TransferModal";
import { ActionModals } from "./ActionModals";
import { ResolveTicketModal } from "./ResolveTicketModal";
import { ImageLightbox, LightboxImage } from "./chat/ImageLightbox";
import { ActivityModal } from "./crm/ActivityModal";
import { useResizable } from "@/hooks/useResizable";
import { buildPropertyMessage } from "@/utils/propertyMessage";
import type { Property } from "@/types/property.types";

// Modular Hooks
import { useChatWorkflow } from "@/hooks/useChatWorkflow";

interface Props {
  activeContact: Contact;
  aiConfig: AIConfig;
  readOnly?: boolean;
  onBack?: () => void;
  onResolve?: (category: string) => void;
  onContactUpdate?: (contact: Contact) => void;
  onTicketUpdate?: (id: string, updates: Record<string, unknown>) => void;
  onSetContactBlockStatus?: (phone: string, blocked: boolean) => void;
  onSetArchived?: (ticketId: string, archived: boolean) => void;
  onSetPinned?: (ticketId: string, pinned: boolean) => void;
  onSetMuted?: (ticketId: string, mutedUntil: string | null) => void;
}

/**
 * [APP] CHAT INTERFACE (ORCHESTRATOR)
 * 
 * SRP REFACTORED: This file now only coordinates specialized sub-components.
 * Logic is moved to useChatWorkflow.ts.
 */
export const ChatInterface: React.FC<Props> = ({
  activeContact,
  aiConfig,
  readOnly = false,
  onBack,
  onResolve,
  onContactUpdate,
  onTicketUpdate,
  onSetContactBlockStatus,
  onSetArchived,
  onSetPinned,
  onSetMuted,
}) => {
  // 1. DATA & WORKFLOW HOOK
  const {
    messages,
    isTyping,
    isRemoteTyping,
    isSyncing,
    pinnedMessage,
    chatEndRef,
    handleSendMessage,
    syncHistory,
    handleReact,
    handleEditMessage,
    handleDeleteMessage,
    handleStarMessage,
    handleShareLocation,
    handleTransfer,
    scrollToBottom,
    emitTyping,
  } = useChatWorkflow({ activeContact, aiConfig });
  const { t } = useTranslation();

  // 2. UI STATE (Local Modals)
  const [inputValue, setInputValue] = useState("");
  const [isWhisperMode, setIsWhisperMode] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  interface Viewer { id: string; name: string; email: string; }
  const [activeViewers, setActiveViewers] = useState<Viewer[]>([]);

  const getMyUserId = useCallback(() => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        return (jwtDecode<{ id: string }>(token)).id;
      }
    } catch (e) {}
    return null;
  }, []);

  // Sync viewing conversation status and subscribe to active viewers list
  useEffect(() => {
    if (!activeContact?.id) return;

    useSocketStore.getState().emit("agent:viewing_conversation", {
      conversationId: activeContact.id,
      isViewing: true,
    });

    const unsubscribe = useSocketStore.getState().subscribe<{ conversationId: string; viewers: Viewer[] }>(
      "conversation:active_viewers",
      (data) => {
        if (data && data.conversationId === activeContact.id) {
          setActiveViewers(data.viewers);
        }
      }
    );

    return () => {
      useSocketStore.getState().emit("agent:viewing_conversation", {
        conversationId: activeContact.id,
        isViewing: false,
      });
      unsubscribe();
      setActiveViewers([]);
    };
  }, [activeContact?.id]);

  const handleInputChange = useCallback((val: string) => {
    setInputValue(val);
    
    emitTyping("composing");

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping("paused");
    }, 3000);
  }, [emitTyping]);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedLibraryMedia, setSelectedLibraryMedia] = useState<import("@/services/mediaService").Media | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Panels & Modals visibility
  const [is360Visible, setIs360Visible] = useState(false);

  const { size: panel360Width, startResizing: startResizing360 } = useResizable({
    initialSize: 380,
    minSize: 320,
    maxSize: 600,
    anchor: "end",
    storageKey: "reply_360_panel_width",
  });
  
  useEffect(() => {
    // Initial check
    const isLarge = window.innerWidth > 1024;
    setIs360Visible(isLarge);

    const handleResize = () => {
      if (window.innerWidth <= 1024) setIs360Visible(false);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [showParticipants, setShowParticipants] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [activeActionModal, setActiveActionModal] = useState<"SCHEDULE" | "PRODUCT" | "PROPERTY" | "PAYMENT" | "DATA" | "CONTACT" | null>(null);

  // CRM Activity Modals (Task / Meeting from 360 Panel)
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityType, setActivityType] = useState<"TASK" | "MEETING">("TASK");

  // Lightbox State
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Extract all images from conversation for the Lightbox gallery
  const lightboxImages = useMemo(() => {
    return messages
      .filter((msg) => {
        const mediaObj = msg.metadata?.media as { type?: string, url?: string } | undefined;
        // Strictly check for image type to avoid putting PDFs/Audio in the gallery
        const type = mediaObj?.type?.toLowerCase() || 
                     (msg.content === "[IMAGE]" ? "image" : undefined) || 
                     ((msg.type && msg.type !== "text") ? msg.type.toLowerCase() : undefined);
        return type === "image" && (msg.mediaUrl || mediaObj?.url);
      })
      .map((msg) => {
        const mediaObj = msg.metadata?.media as { url?: string } | undefined;
        const rawUrl = msg.mediaUrl || mediaObj?.url || "";
        const apiUrl = import.meta.env.DEV
          ? "http://localhost:4000"
          : (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/api\/?$/, "").replace(/\/$/, "");
        
        const fullUrl = rawUrl.startsWith("http") || rawUrl.startsWith("blob:") || rawUrl.startsWith("data:") 
          ? rawUrl 
          : `${apiUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

        // Get readable sender
        const senderObj = msg.sender;
        let senderName = t("chat.image", "Imagen");
        if (msg.direction === "OUTBOUND" || msg.sender === "agent") senderName = t("chat.agent", "Agente");
        else if (msg.senderName) senderName = msg.senderName;
        else if (senderObj && typeof senderObj === "object") {
          const s = senderObj as { name?: string; phone?: string };
          senderName = s.name || s.phone || t("chat.client", "Cliente");
        }

        return {
          id: msg.id,
          url: fullUrl,
          sender: senderName,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
        } as LightboxImage;
      });
  }, [messages]);

  const handleImageClick = useCallback((url: string) => {
    // Find index of clicked image
    const idx = lightboxImages.findIndex((img) => img.url === url);
    if (idx !== -1) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    } else {
      // Fallback if not found in gallery map for some reason
      window.open(url, "_blank");
    }
  }, [lightboxImages]);

  // 3. EVENT HANDLERS
  const onSend = useCallback(async () => {
    if (!inputValue.trim() && !selectedFile && !selectedLibraryMedia && !isRecording) return;

    // Optimistic Reset: Clear inputs immediately for better perceived performance
    const textToSend = inputValue;
    const fileToSend = selectedFile;
    const libraryToSend = selectedLibraryMedia;
    const replyTarget = replyingTo;

    setInputValue("");
    setReplyingTo(null);
    setSelectedFile(null);
    setSelectedLibraryMedia(null);

    // Stop typing immediately
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTyping("paused");

    if (libraryToSend) {
      // Library asset is already hosted — send as directAttachment (no re-upload)
      const typeMap = { IMAGE: "image", AUDIO: "audio", VIDEO: "video", DOCUMENT: "document" } as const;
      await handleSendMessage(textToSend, null, replyTarget, undefined, {
        url: libraryToSend.url,
        type: typeMap[libraryToSend.type] || "document",
        name: libraryToSend.originalName || libraryToSend.filename,
        mimetype: libraryToSend.mimeType || "application/octet-stream",
      }, isWhisperMode);
    } else {
      await handleSendMessage(textToSend, fileToSend, replyTarget, undefined, undefined, isWhisperMode);
    }
    setIsWhisperMode(false);
    scrollToBottom();
  }, [inputValue, selectedFile, selectedLibraryMedia, isRecording, replyingTo, handleSendMessage, scrollToBottom, isWhisperMode]);

  const onSlashSelect = (reply: QuickReply) => {
    handleInputChange(reply.content);
  };

  const handlePriorityChange = useCallback(async (newPriority: "LOW" | "MEDIUM" | "HIGH") => {
    if (!activeContact.ticketId) return;
    try {
      const { updatePriority } = await import("@/services/ticketService");
      await updatePriority(activeContact.ticketId, newPriority);
      onTicketUpdate?.(activeContact.ticketId, { priority: newPriority });
      toast.success(`Prioridad: ${newPriority}`);
    } catch (error) {
      toast.error(t("chat.priority_update_error", "Error al actualizar la prioridad"));
      console.error(error);
    }
  }, [activeContact.ticketId, onTicketUpdate]);

  const openResolveModal = () => setShowResolveModal(true);
  const openTransferModal = () => setShowTransferModal(true);

  return (
    <div className="flex h-full w-full bg-gray-50/50 dark:bg-[#0b141a] overflow-hidden relative border-l border-gray-200 dark:border-white/5">
      <div className="flex-1 flex flex-col h-full relative overflow-hidden min-w-0">
        
        {/* TOP: Header */}
        <ChatHeader
          displayContact={activeContact}
          socketStatus="connected" 
          isSyncing={isSyncing}
          onBack={onBack}
          onSync={syncHistory}
          onResolve={openResolveModal}
          onTransfer={openTransferModal}
          onEditContact={() => setShowEditModal(true)}
          toggleCustomer360={() => setIs360Visible(!is360Visible)}
          showParticipants={() => setShowParticipants(true)}
          isCustomer360Visible={is360Visible}
          onChangePriority={handlePriorityChange}
          onToggleBlockContact={
            onSetContactBlockStatus && activeContact.phone
              ? () =>
                  onSetContactBlockStatus(
                    activeContact.phone!,
                    !activeContact.isBlocked,
                  )
              : undefined
          }
          onToggleArchived={
            onSetArchived && activeContact.ticketId
              ? () =>
                  onSetArchived(activeContact.ticketId!, !activeContact.isArchived)
              : undefined
          }
          onTogglePinned={
            onSetPinned && activeContact.ticketId
              ? () => onSetPinned(activeContact.ticketId!, !activeContact.isPinned)
              : undefined
          }
          onToggleMuted={
            onSetMuted && activeContact.ticketId
              ? () =>
                  onSetMuted(
                    activeContact.ticketId!,
                    activeContact.mutedUntil
                      ? null
                      : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
                  )
              : undefined
          }
        />

        {/* ENTERPRISE TAGS NAVBAR: Space-efficient horizontal scroll */}
        <TagsNavbar 
          contact={activeContact} 
          onContactUpdate={onContactUpdate} 
        />

        {/* UNREGISTERED CRM CONTACT BANNER */}
        {!activeContact.isGroup && !activeContact.realContactId && (
          <div className="bg-amber-500/10 dark:bg-amber-500/5 border-b border-amber-500/20 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-amber-800 dark:text-amber-300 font-semibold animate-fade-in flex-shrink-0">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{t("chat.unregistered_contact", "Este contacto no está registrado en el CRM. ¿Deseas guardarlo para hacerle seguimiento?")}</span>
            </span>
            <button
              onClick={() => setShowEditModal(true)}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white px-3 py-1.5 rounded-xl font-bold transition-all shadow-md shadow-amber-500/10 text-[10px] uppercase tracking-wider"
            >
              {t("chat.register_contact", "Registrar Contacto")}
            </button>
          </div>
        )}

        {/* MIDDLE: Message Stream */}
        <MessageStream
          messages={messages}
          isGroup={activeContact.isGroup}
          isTyping={isTyping}
          isRemoteTyping={isRemoteTyping}
          isSyncing={isSyncing}
          chatEndRef={chatEndRef}
          scrollToMessage={(id) => {
             const el = document.getElementById(`msg-${id}`);
             el?.scrollIntoView({ behavior: 'smooth' });
          }}
          onReact={handleReact}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onStarMessage={handleStarMessage}
          onReply={setReplyingTo}
          onImageClick={handleImageClick}
          pinnedMessage={pinnedMessage}
        />

        {/* BOTTOM: Composer */}
        {!readOnly && (
          <>
            {activeViewers.filter(v => v.id !== getMyUserId()).length > 0 && (
              <div className="mx-4 mb-2 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300">
                <span className="text-sm">⚠️</span>
                <span>
                  {activeViewers
                    .filter(v => v.id !== getMyUserId())
                    .map(v => v.name || v.email)
                    .join(", ")}{" "}
                  {activeViewers.filter(v => v.id !== getMyUserId()).length === 1
                    ? "está viendo este chat en este momento para evitar duplicación."
                    : "están viendo este chat en este momento para evitar duplicación."}
                </span>
              </div>
            )}
            <ChatComposer
              inputValue={inputValue}
            setInputValue={handleInputChange}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            selectedLibraryMedia={selectedLibraryMedia}
            setSelectedLibraryMedia={setSelectedLibraryMedia}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            onSend={onSend}
            onFileSelect={() => {}} // Internal ref logic in Composer handles this
            onEmojiToggle={() => {}} // Toggle emoji picker in composer
            onAudioStop={async (file) => {
               setSelectedFile(file);
               // [UX] WhatsApp style: Send voice note immediately after recording
               await handleSendMessage("", file, replyingTo);
               setSelectedFile(null);
               setReplyingTo(null);
            }}
            onSlashSelect={onSlashSelect}
            // Advanced Action Menus
            onSchedule={() => setActiveActionModal("SCHEDULE")}
            onProduct={() => setActiveActionModal("PRODUCT")}
            onProperty={() => setActiveActionModal("PROPERTY")}
            onPayment={() => setActiveActionModal("PAYMENT")}
            onRequestData={() => setActiveActionModal("DATA")}
            onShareLocation={handleShareLocation}
            onContact={() => setActiveActionModal("CONTACT")}
            onAICopilotClick={async (action) => {
              // Build chat context for IA
              const chatHistory = messages
                .slice(-15)
                .map((m) => `${m.direction === "OUTBOUND" ? "Agente" : "Cliente"}: ${m.content}`)
                .join("\n");

              const toastId = toast.loading("Consultando al Copiloto de IA...");
              try {
                const { api } = await import("@/lib/axios");
                const res = await api.post("/ai/copilot", {
                  action,
                  text: inputValue,
                  context: chatHistory,
                });

                if (res.data && res.data.response) {
                  toast.success("Respuesta generada", { id: toastId });
                  if (action === "summarize") {
                    // Inject summary as an internal note or overlay toast. Let's make it a nice visual toast or insert into text box
                    setInputValue((prev) => `${prev}\n\n📋 *Resumen de IA*:\n${res.data.response}`);
                  } else {
                    // Update writing composer input text value directly
                    setInputValue(res.data.response);
                  }
                } else {
                  toast.error("El copiloto no devolvió respuesta.", { id: toastId });
                }
              } catch (err) {
                toast.error("Error al conectar con la IA. Asegúrate de configurar Gemini.", { id: toastId });
                console.error("[AICopilot] Error processing action:", err);
              }
            }}
            isRecording={isRecording}
            setIsRecording={(rec) => {
              setIsRecording(rec);
              emitTyping(rec ? "recording" : "paused");
            }}
            isWhisperMode={isWhisperMode}
            onWhisperToggle={() => setIsWhisperMode(!isWhisperMode)}
          />
          </>
        )}
      </div>

      {/* RIGHT: Customer 360 Panel */}
      {is360Visible && (
        <>
          {/* RESIZER HANDLE */}
          <div
            onMouseDown={startResizing360}
            className="hidden lg:block w-1.5 h-full cursor-col-resize absolute z-30 hover:bg-indigo-500/30 transition-colors group"
            style={{ right: `${panel360Width - 3}px` }}
          >
            <div className="w-[1px] h-full bg-transparent group-hover:bg-indigo-500 mx-auto" />
          </div>

          {/* MOBILE OVERLAY BACKGROUND */}
          <div 
            className="lg:hidden fixed inset-0 bg-black/50 z-40 transition-opacity" 
            onClick={() => setIs360Visible(false)} 
          />

          <div 
            className="absolute lg:relative right-0 top-0 h-full bg-white dark:bg-[#0b141a] flex-shrink-0 overflow-hidden min-w-0 z-50 w-full sm:w-[400px] lg:w-auto shadow-2xl lg:shadow-none transition-transform"
            style={window.innerWidth > 1024 ? { width: `${panel360Width}px` } : {}}
          >
              <Customer360Panel 
                contact={activeContact} 
                onEditContact={() => setShowEditModal(true)}
              onContactUpdate={onContactUpdate}
              onCreateTask={() => {
                setActivityType("TASK");
                setShowActivityModal(true);
              }}
                onScheduleMeeting={() => {
                  setActivityType("MEETING");
                  setShowActivityModal(true);
                }}
              />
          </div>
        </>
      )}

      {/* MODALS OVERLAY */}
      {showEditModal && (
        <ContactEditModal
          contact={activeContact}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={(c) => onContactUpdate?.(c)}
        />
      )}

      {showResolveModal && (
        <ResolveTicketModal
          isOpen={showResolveModal}
          onClose={() => setShowResolveModal(false)}
          onResolve={(category) => {
            onResolve?.(category);
            setShowResolveModal(false);
          }}
        />
      )}

      {showTransferModal && (
        <TransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onTransfer={(targetId, type, note) => {
             handleTransfer(targetId, type, note);
             setShowTransferModal(false);
          }}
          currentUserId={activeContact.assignedToId || undefined}
        />
      )}

      {showParticipants && (
        <GroupParticipantsPanel
          conversationId={activeContact.ticketId || ""} // Using ticketId as proxy if backend handles it, or needs conversationId
          onClose={() => setShowParticipants(false)}
        />
      )}

      {/* ACTION MODALS (Schedule, Product, etc) */}
      <ActionModals
        type={activeActionModal}
        onClose={() => setActiveActionModal(null)}
        onSchedule={(date, msg) => {
          handleSendMessage(msg, null, replyingTo, date);
          setActiveActionModal(null);
        }}
        onProduct={(p) => {
          const formatProductPrice = (price: number, currency: string): string => {
            try {
              return new Intl.NumberFormat(currency === "COP" ? "es-CO" : "en-US", {
                style: "currency",
                currency,
                minimumFractionDigits: 0,
              }).format(price);
            } catch {
              return `${currency} ${price}`;
            }
          };

          const caption = `📦 *${p.name}*\n💰 ${formatProductPrice(p.price, p.currency)}${p.description ? `\n\n${p.description}` : ""}${p.sku ? `\n🏷️ SKU: ${p.sku}` : ""}`;

          if (p.imageUrl) {
            // Send as image message with caption (Enterprise)
            handleSendMessage(caption, null, replyingTo, undefined, {
              url: p.imageUrl,
              type: "image",
              name: p.name,
              mimetype: "image/jpeg",
            });
          } else {
            // Fallback: No image, send as formatted text
            handleSendMessage(caption, null, replyingTo);
          }
          setActiveActionModal(null);
        }}
        onProperty={(property: Property) => {
          const caption = buildPropertyMessage(property);
          const cover = property.images.find((img) => img.isCover) || property.images[0];

          if (cover) {
            // Send as image message with caption (Enterprise)
            handleSendMessage(caption, null, replyingTo, undefined, {
              url: cover.url,
              type: "image",
              name: property.title,
              mimetype: "image/jpeg",
            });
          } else {
            // Fallback: No image, send as formatted text
            handleSendMessage(caption, null, replyingTo);
          }
          setActiveActionModal(null);
        }}
        onPayment={(amt, concept, currency) => {
          const formatted = new Intl.NumberFormat(currency === "COP" ? "es-CO" : "en-US", {
            style: "currency",
            currency: currency,
            minimumFractionDigits: 0
          }).format(parseFloat(amt));
          
          handleSendMessage(`${t("chat.payment_request", "*SOLICITUD DE PAGO*")}\n${concept}\n\n${t("chat.amount", "Monto:")} ${formatted}`, null, replyingTo);
          setActiveActionModal(null);
        }}
        onRequestData={(fields) => {
          const list = fields.map(f => `• ${f}`).join("\n");
          handleSendMessage(`${t("chat.data_request", "*SOLICITUD DE DATOS*")}\n\n${t("chat.data_request_msg_start", "Para continuar con el proceso, requerimos la siguiente información:")}\n\n${list}\n\n${t("chat.data_request_msg_end", "Quedamos atentos a tu respuesta.")}`, null, replyingTo);
          setActiveActionModal(null);
        }}
        onContact={(contact) => {
          handleSendMessage("", null, replyingTo, undefined, {
            url: "",
            type: "contact",
            name: contact.name,
            mimetype: "text/vcard",
            contactName: contact.name,
            phone: contact.phone || "",
          });
          setActiveActionModal(null);
        }}
      />

      {/* CRM ACTIVITY MODAL */}
      {showActivityModal && (
        <ActivityModal
          isOpen={showActivityModal}
          onClose={() => setShowActivityModal(false)}
          onSave={() => {
            setShowActivityModal(false);
            toast.success(
              activityType === "TASK"
                ? t("chat.task_assigned", "Tarea asignada correctamente.")
                : t("chat.meeting_scheduled", "Reunión agendada correctamente.")
            );
          }}
          initialType={activityType}
          preselectedContact={{
            id: activeContact.id,
            name: activeContact.name,
            email: activeContact.email,
          }}
        />
      )}

      {/* IMAGE LIGHTBOX MODAL */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <ImageLightbox 
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}

    </div>
  );
};

export default memo(ChatInterface);
