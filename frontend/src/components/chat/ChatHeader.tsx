import React, { useState, useEffect } from "react";
import { Contact, Tag, AIConfig, SenderType } from "@/types";
import { API_BASE_URL } from "@/services/apiConfig";
import { 
  ChevronLeft, 
  ExternalLink, 
  Ban, 
  CheckCircle2, 
  Phone, 
  UserPlus, 
  RefreshCcw, 
  Users,
  FileText
} from "lucide-react";
import { ChatHeaderEnhanced } from "../ChatHeaderEnhanced";

interface ChatHeaderProps {
  displayContact: Contact;
  socketStatus: "connected" | "disconnected";
  isSyncing: boolean;
  onBack?: () => void;
  onSync: () => void;
  onResolve: () => void;
  onTransfer: () => void;
  onEditContact: () => void;
  toggleCustomer360: () => void;
  showParticipants: () => void;
  isCustomer360Visible: boolean;
  onChangePriority?: (priority: "LOW" | "MEDIUM" | "HIGH") => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  displayContact,
  socketStatus,
  isSyncing,
  onBack,
  onSync,
  onResolve,
  onTransfer,
  onEditContact,
  toggleCustomer360,
  showParticipants,
  isCustomer360Visible,
  onChangePriority,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyChat = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    // Logic for actual copying would go here or in a hook
  };

  return (
    <ChatHeaderEnhanced
      contact={displayContact}
      socketStatus={socketStatus}
      onBack={onBack}
      onEditContact={onEditContact}
      onResolve={onResolve}
      onTransfer={onTransfer}
      onCopyChat={handleCopyChat}
      isCopied={isCopied}
      onTagsClick={() => {}} // Not used in this version
      onForceReconnect={() => window.location.reload()}
      ticketCreatedAt={displayContact.ticketCreatedAt ? new Date(displayContact.ticketCreatedAt) : undefined}
      currentPriority={displayContact.priority as any}
      onChangePriority={onChangePriority}
      isCustomer360Visible={isCustomer360Visible}
      onToggleCustomer360={toggleCustomer360}
      onToggleParticipantsPanel={displayContact.isGroup ? showParticipants : undefined}
      onSyncHistory={onSync}
      isTyping={false} // Can be wired up if needed
    />
  );
};
