import React, { 
  useState, 
  useCallback, 
  useEffect, 
  useMemo, 
  memo 
} from "react";
import { 
  Contact,
  Message, 
  AIConfig, 
  SenderType,
  QuickReply,
} from "@/types";
import { toast } from "sonner";

// Separate Components
import { ChatHeader } from "./chat/ChatHeader";
import { MessageStream } from "./chat/MessageStream";
import { ChatComposer } from "./chat/ChatComposer";
import { Customer360Panel } from "./Customer360Panel";
import { GroupParticipantsPanel } from "./GroupParticipantsPanel";
import { ContactEditModal } from "./ContactEditModal";
import { TransferModal } from "./TransferModal";
import { ActionModals } from "./ActionModals";
import { ResolveTicketModal } from "./ResolveTicketModal";
import { ImageLightbox, LightboxImage } from "./chat/ImageLightbox";

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
}) => {
  // 1. DATA & WORKFLOW HOOK
  const {
    messages,
    isTyping,
    isRemoteTyping,
    isSyncing,
    chatEndRef,
    handleSendMessage,
    syncHistory,
    handleReact,
    handleTransfer,
    scrollToBottom,
  } = useChatWorkflow({ activeContact, aiConfig });

  // 2. UI STATE (Local Modals)
  const [inputValue, setInputValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Panels & Modals visibility
  const [is360Visible, setIs360Visible] = useState(false);
  
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
  const [activeActionModal, setActiveActionModal] = useState<"SCHEDULE" | "PRODUCT" | "PAYMENT" | "DATA" | null>(null);

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
        let senderName = "Imagen";
        if (msg.direction === "OUTBOUND" || msg.sender === "agent") senderName = "Agente";
        else if (msg.senderName) senderName = msg.senderName;
        else if (senderObj && typeof senderObj === "object") senderName = (senderObj as any).name || (senderObj as any).phone || "Cliente";

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
    if (!inputValue.trim() && !selectedFile && !isRecording) return;
    
    // Optimistic Reset: Clear inputs immediately for better perceived performance
    const textToSend = inputValue;
    const fileToSend = selectedFile;
    const replyTarget = replyingTo;

    setInputValue("");
    setReplyingTo(null);
    setSelectedFile(null);
    
    await handleSendMessage(textToSend, fileToSend, replyTarget);
    scrollToBottom();
  }, [inputValue, selectedFile, isRecording, replyingTo, handleSendMessage, scrollToBottom]);

  const onSlashSelect = (reply: QuickReply) => {
    setInputValue(reply.content);
  };

  const openResolveModal = () => setShowResolveModal(true);
  const openTransferModal = () => setShowTransferModal(true);

  return (
    <div className="flex h-full w-full bg-gray-50/50 dark:bg-[#0b141a] overflow-hidden relative border-l border-gray-200 dark:border-white/5">
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        
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
        />

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
          onReply={setReplyingTo}
          onImageClick={handleImageClick}
        />

        {/* BOTTOM: Composer */}
        {!readOnly && (
          <ChatComposer
            inputValue={inputValue}
            setInputValue={setInputValue}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
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
            onPayment={() => setActiveActionModal("PAYMENT")}
            onRequestData={() => setActiveActionModal("DATA")}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
          />
        )}
      </div>

      {/* RIGHT: Customer 360 Panel */}
      {is360Visible && (
        <div className="hidden lg:block w-[380px] h-full border-l border-gray-200 dark:border-white/5 bg-white dark:bg-[#0b141a] animate-in slide-in-from-right duration-300">
           <Customer360Panel 
             contact={activeContact} 
             onEditContact={() => setShowEditModal(true)}
           />
        </div>
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
          onTransfer={(targetId, type) => {
             handleTransfer(targetId, type);
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
          handleSendMessage(msg, null, replyingTo); // Placeholder for scheduled logic
          setActiveActionModal(null);
        }}
        onProduct={(p) => {
          handleSendMessage(`Interesado en: ${p.name}\n${p.imageUrl || ""}`, null, replyingTo);
          setActiveActionModal(null);
        }}
        onPayment={(amt, concept) => {
          handleSendMessage(`Solicitud de pago: ${concept} - $${amt}`, null, replyingTo);
          setActiveActionModal(null);
        }}
        onRequestData={(data) => {
          handleSendMessage(`Por favor, comparte tu ${data}`, null, replyingTo);
          setActiveActionModal(null);
        }}
      />

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
