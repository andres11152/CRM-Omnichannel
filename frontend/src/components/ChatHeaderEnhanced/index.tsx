import React from "react";
import { useTranslation } from "react-i18next";
import { Contact, Tag } from "@/types";
import { useSlaTimer } from "./useSlaTimer";
import { ContactIdentity } from "./ContactIdentity";
import { PrioritySelector } from "./PrioritySelector";
import { ActionMenu } from "./ActionMenu";

interface Agent {
  id: string;
  name: string;
  status: "available" | "busy" | "away";
}

interface ChatHeaderEnhancedProps {
  contact: Contact;
  onBack?: () => void;
  onEditContact: () => void;
  onResolve: () => void;
  onEmail?: () => void;
  onTransfer: () => void;
  onCopyChat: () => void;
  onTagsClick: () => void;
  isCopied: boolean;
  socketStatus: "connected" | "disconnected";
  onForceReconnect: () => void;
  /** Timestamp of the last message in this conversation (either direction). */
  lastMessageAt?: Date;
  /** Direction of the last message — INBOUND means the customer is waiting
   * for a reply and the SLA timer should run; OUTBOUND means we already
   * answered, so there's nothing to count down. */
  lastMessageDirection?: "INBOUND" | "OUTBOUND" | null;
  responseTimeSLA?: number;
  onAssignTo?: (agentId: string) => void;
  onChangePriority?: (priority: "LOW" | "MEDIUM" | "HIGH") => void;
  currentPriority?: "LOW" | "MEDIUM" | "HIGH";
  agents?: Agent[];
  onToggleChatList?: () => void;
  isChatListVisible?: boolean;
  onToggleCustomer360?: () => void;
  isCustomer360Visible?: boolean;
  onToggleParticipantsPanel?: () => void;
  isParticipantsPanelVisible?: boolean;
  availableTags?: Pick<Tag, "id" | "name" | "color">[]; // Receives tag definitions
  isTyping?: boolean;
  onSyncHistory?: () => void;
  onToggleBlockContact?: () => void;
  onToggleArchived?: () => void;
  onTogglePinned?: () => void;
  onToggleMuted?: () => void;
}

const ChatHeaderEnhancedComponent: React.FC<ChatHeaderEnhancedProps> = ({
  contact,
  onBack,
  onEditContact,
  onResolve,
  onEmail,
  onTransfer,
  onCopyChat,
  socketStatus,
  lastMessageAt,
  lastMessageDirection,
  responseTimeSLA = 15,
  onChangePriority,
  currentPriority = "MEDIUM",
  onToggleChatList,
  isChatListVisible = true,
  onToggleCustomer360,
  isCustomer360Visible = true,
  onToggleParticipantsPanel,
  isParticipantsPanelVisible = false,
  isTyping = false,
  onSyncHistory,
  onToggleBlockContact,
  onToggleArchived,
  onTogglePinned,
  onToggleMuted,
}) => {
  const isTightMode = isChatListVisible && isCustomer360Visible; // Detect "Tight Mode" (Both Panels Open)
  const { t } = useTranslation();
  const { isAwaitingReply, timeElapsed, getSLAColor, formatElapsed } = useSlaTimer(
    lastMessageAt,
    lastMessageDirection,
    responseTimeSLA,
  );

  return (
    <div className="flex flex-col w-full z-30 transition-all duration-300">
      <div className="bg-white dark:bg-reply-panel-dark px-3 sm:px-4 py-1.5 flex items-center justify-between border-b border-gray-200 dark:border-reply-border-dark flex-shrink-0 relative shadow-sm h-[52px] z-30">
        {/* LEFT: Identity & Toggles */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {onToggleChatList && (
            <button
              onClick={onToggleChatList}
              className="hidden md:flex p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400 transition-all active:scale-95 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 h-9 w-9 items-center justify-center"
              title={isChatListVisible ? t("chat.hide_list", "Ocultar lista") : t("chat.show_list", "Mostrar lista")}
            >
              <svg
                className={`w-5 h-5 transition-transform duration-300 ${isChatListVisible ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}

          {onBack && (
            <button onClick={onBack} className="md:hidden p-1.5 -ml-2 text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <ContactIdentity
            contact={contact}
            onEditContact={onEditContact}
            socketStatus={socketStatus}
            isChatListVisible={isChatListVisible}
            isCustomer360Visible={isCustomer360Visible}
            isTyping={isTyping}
          />
        </div>
        {/* RIGHT: Actions Toolbar */}
        <div className="flex items-center gap-1 sm:gap-2 pl-2">
          <div className="flex items-center gap-2 hidden lg:flex">
            {/* SLA Timer: only shown while the customer's last message is unanswered */}
            {isAwaitingReply && (
              <div
                className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/50 px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 h-9 shrink-0"
                title={t("chat.waiting_for_reply", "Tiempo esperando respuesta del agente")}
              >
                <div className={`w-2 h-2 rounded-full animate-pulse ${getSLAColor()}`}></div>
                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 tracking-tight">{formatElapsed(timeElapsed)}</span>
              </div>
            )}
          </div>

          {/* PRIORITY SELECTOR (Enterprise Standardized) */}
          <PrioritySelector currentPriority={currentPriority} onChangePriority={onChangePriority} />

          {/* 2. Direct Actions (Enterprise Refined) */}
          <div className="hidden md:flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
            {onTransfer && (
              <button
                onClick={onTransfer}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-all border border-transparent hover:border-blue-100 dark:hover:border-blue-800/50 h-9 w-9 flex items-center justify-center"
                title={t("chat.transfer", "Transferir")}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* 3. Primary Action: Resolve (Enterprise Polished) */}
          <button
            onClick={onResolve}
            className={`
              hidden md:flex items-center gap-2 px-4 py-1.5 h-9 shrink-0
              bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600
              text-white rounded-md text-[11px] font-bold shadow-sm hover:shadow-md
              transition-all transform active:scale-95
              ${isTightMode ? "aspect-square p-2 justify-center" : ""}
            `}
            title={t("chat.resolve_ticket", "Resolver Ticket")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {!isTightMode && <span className="tracking-wide">{t("chat.resolve", "RESOLVER")}</span>}
          </button>

          {/* 4. Dropdown Menu (Secondary Actions) */}
          <ActionMenu
            contact={contact}
            isTightMode={isTightMode}
            currentPriority={currentPriority}
            onChangePriority={onChangePriority}
            onResolve={onResolve}
            onTransfer={onTransfer}
            onToggleParticipantsPanel={onToggleParticipantsPanel}
            onToggleCustomer360={onToggleCustomer360}
            onEmail={onEmail}
            onCopyChat={onCopyChat}
            onSyncHistory={onSyncHistory}
            onEditContact={onEditContact}
            onTogglePinned={onTogglePinned}
            onToggleMuted={onToggleMuted}
            onToggleArchived={onToggleArchived}
            onToggleBlockContact={onToggleBlockContact}
          />

          {/* 5. Right Sidebar Toggles (Enterprise Refined) */}
          <div className="hidden md:flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
            {onToggleParticipantsPanel && (
              <button
                onClick={onToggleParticipantsPanel}
                className={`p-2 rounded-md transition-all h-9 w-9 flex items-center justify-center ${isParticipantsPanelVisible ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "text-gray-400 hover:bg-gray-100 border border-transparent"}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </button>
            )}
            {onToggleCustomer360 && !onToggleParticipantsPanel && (
              <button
                onClick={onToggleCustomer360}
                className={`p-2 rounded-md transition-all h-9 w-9 flex items-center justify-center ${isCustomer360Visible ? "bg-blue-50 text-blue-600 border border-blue-100" : "text-gray-400 hover:bg-gray-100 border border-transparent"}`}
              >
                <svg
                  className={`w-5 h-5 transition-transform ${!isCustomer360Visible ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export const ChatHeaderEnhanced = React.memo(ChatHeaderEnhancedComponent);
