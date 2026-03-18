import React, { useState, useEffect, useRef } from "react";
import { Contact, Tag } from "@/types";
import { Avatar } from "@/components/common/Avatar";

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
  ticketCreatedAt?: Date;
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
}

const ChatHeaderEnhancedComponent: React.FC<ChatHeaderEnhancedProps> = ({
  contact,
  onBack,
  onEditContact,
  onResolve,
  onEmail,
  onTransfer,
  onCopyChat,
  onTagsClick,
  isCopied,
  socketStatus,
  onForceReconnect,
  ticketCreatedAt,
  responseTimeSLA = 15,
  onAssignTo,
  onChangePriority,
  currentPriority = "MEDIUM",
  agents = [],
  onToggleChatList,
  isChatListVisible = true,
  onToggleCustomer360,
  isCustomer360Visible = true,
  onToggleParticipantsPanel,
  isParticipantsPanelVisible = false,
  availableTags = [],
  isTyping = false,
  onSyncHistory,
}) => {
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const isTightMode = isChatListVisible && isCustomer360Visible; // ?? Detect "Tight Mode" (Both Panels Open)

  const [slaStatus, setSlaStatus] = useState<"ok" | "warning" | "critical">(
    "ok",
  );
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (!ticketCreatedAt) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - new Date(ticketCreatedAt).getTime()) / 60000,
      );
      setTimeElapsed(elapsed);

      if (elapsed >= responseTimeSLA) {
        setSlaStatus("critical");
      } else if (elapsed >= responseTimeSLA * 0.75) {
        setSlaStatus("warning");
      } else {
        setSlaStatus("ok");
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [ticketCreatedAt, responseTimeSLA]);

  const getSLAColor = () => {
    switch (slaStatus) {
      case "ok":
        return "bg-green-500 border-green-400";
      case "warning":
        return "bg-yellow-500 border-yellow-400 animate-pulse";
      case "critical":
        return "bg-red-500 border-red-400 animate-pulse";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
      case "MEDIUM":
        return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800";
      case "LOW":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800";
      default:
        return "bg-reply-bg text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-reply-border-dark";
    }
  };

  // ??? HELPER: Premium Dropdown Menu
  const ActionMenu = () => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const menuItems = [
      // 📱 MOBILE ONLY ACTIONS (Moved from toolbar to clear space)
      {
        icon: (
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
              d="M5 13l4 4L19 7"
            />
          </svg>
        ),
        label: "Resolver Ticket",
        onClick: onResolve,
        visible: true,
        className:
          "md:hidden font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10",
        iconClassName: "text-green-600 dark:text-green-400",
      },
      {
        icon: (
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
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        ),
        label: "Transferir",
        onClick: onTransfer,
        visible: !!onTransfer,
        className: "md:hidden",
      },
      {
        icon: (
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        ),
        label: "Participantes",
        onClick: onToggleParticipantsPanel,
        visible: !!onToggleParticipantsPanel,
        className: "md:hidden",
      },
      {
        icon: (
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
              d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
            />
          </svg>
        ),
        label: "Info. Cliente (360)",
        onClick: onToggleCustomer360,
        visible: !!onToggleCustomer360 && !onToggleParticipantsPanel,
        className: "md:hidden",
      },
      {
        icon: (
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
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        ),
        label: "Enviar Email",
        onClick: onEmail,
        visible: !!onEmail,
      },
      {
        icon: (
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
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            />
          </svg>
        ),
        label: "Copiar Historial",
        onClick: onCopyChat,
        visible: true,
      },
      {
        icon: (
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        ),
        label: "Sincronizar Historial",
        onClick: onSyncHistory,
        visible: !!onSyncHistory,
      },
      {
        icon: (
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
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        ),
        label: "Editar Contacto",
        onClick: onEditContact,
        visible: true,
      },
    ];

    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-reply-border-dark transition-all hover:shadow-sm active:scale-95"
          title="M�s Acciónes"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-reply-panel-dark rounded-xl shadow-xl border border-gray-100 dark:border-reply-border-dark overflow-hidden z-[100]">
            <div className="py-1">
              {menuItems
                .filter((i) => i.visible)
                .map((item, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      item.onClick?.();
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-800 flex items-center gap-3 transition-colors ${item.className || ""}`}
                  >
                    <span
                      className={`text-gray-400 dark:text-gray-500 group-hover:text-blue-500 ${item.iconClassName || ""}`}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
            </div>

            {/* Priority Selector Inside Dropdown for Ultra-Compact Mode */}
            {isTightMode && (
              <div className="border-t border-gray-100 dark:border-reply-border-dark p-2 bg-reply-bg dark:bg-gray-800/50">
                <div className="text-[10px] font-bold text-gray-400 mb-1 px-2 uppercase">
                  Prioridad
                </div>
                <div className="flex gap-1">
                  {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => onChangePriority?.(p)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold border ${
                        currentPriority === p
                          ? getPriorityColor(p)
                          : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500"
                      }`}
                    >
                      {p.charAt(0)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full z-30 transition-all duration-300">
      <div className="bg-white dark:bg-reply-panel-dark px-3 sm:px-4 py-1.5 flex items-center justify-between border-b border-gray-200 dark:border-reply-border-dark flex-shrink-0 relative shadow-sm h-[52px] z-30">
        {/* LEFT: Identity & Toggles */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {onToggleChatList && (
            <button
              onClick={onToggleChatList}
              className="hidden md:flex p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 transition-all active:scale-95 border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
              title={isChatListVisible ? "Ocultar lista" : "Mostrar lista"}
            >
              <svg
                className={`w-5 h-5 transition-transform duration-300 ${isChatListVisible ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          )}

          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-1.5 -ml-2 text-gray-500"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}

          <div
            className="flex items-center gap-2 sm:gap-3 group cursor-pointer hover:bg-reply-bg dark:hover:bg-gray-800/50 p-1 rounded-lg transition-colors overflow-hidden"
            onClick={onEditContact}
          >
            <div
              className={`relative shrink-0 ${isChatListVisible && isCustomer360Visible ? "hidden 2xl:block" : "block"}`}
            >
              <Avatar
                src={contact.profilePicUrl || contact.avatarUrl || null}
                name={contact.name}
                className="w-8 h-8 sm:w-9 sm:h-9 border-2 border-white dark:border-gray-600 shadow-sm"
              />
              <div
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-white dark:border-[#202c33] ${socketStatus === "connected" ? "bg-green-500" : "bg-red-500"}`}
              ></div>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-gray-900 dark:text-white font-bold text-sm truncate">
                  {contact.name}
                </h2>
                {contact.channel && (
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase shrink-0">
                    {contact.channel}
                  </span>
                )}
              </div>

              {/* 🛡️ WhatsApp-Style: Typing indicator + Tags coexist */}
              <div className="flex flex-col gap-0.5">
                {/* Typing Indicator — Always shows when active, above tags */}
                {isTyping && (
                  <div className="flex items-center gap-1.5 h-4 overflow-hidden">
                    <span className="text-[11px] text-green-500 dark:text-green-400 font-semibold italic tracking-tight animate-pulse">
                      escribiendo
                    </span>
                    <span className="flex gap-[3px] items-end h-3">
                      <span
                        className="w-[4px] h-[4px] bg-green-500 dark:bg-green-400 rounded-full animate-bounce"
                        style={{ animationDuration: "0.6s" }}
                      ></span>
                      <span
                        className="w-[4px] h-[4px] bg-green-500 dark:bg-green-400 rounded-full animate-bounce"
                        style={{
                          animationDuration: "0.6s",
                          animationDelay: "0.15s",
                        }}
                      ></span>
                      <span
                        className="w-[4px] h-[4px] bg-green-500 dark:bg-green-400 rounded-full animate-bounce"
                        style={{
                          animationDuration: "0.6s",
                          animationDelay: "0.3s",
                        }}
                      ></span>
                    </span>
                  </div>
                )}

                {/* Tags moved to dedicated bar below header */}
              </div>
            </div>
          </div>
        </div>
        {/* RIGHT: Actions Toolbar */}
        <div className="flex items-center gap-1 sm:gap-2 pl-2">
          <div className="flex items-center gap-2 hidden lg:flex">
            {/* SLA Timer (Hidden in Tight Mode to save space) */}
            {!isTightMode && ticketCreatedAt && (
              <div className="flex items-center gap-1.5 bg-reply-bg dark:bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-reply-border-dark">
                <div className={`w-2 h-2 rounded-full ${getSLAColor()}`}></div>
                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">
                  {timeElapsed}m
                </span>
              </div>
            )}
          </div>

          {/* PRIORITY SELECTOR (NOW ALWAYS VISIBLE) */}
          <div className="relative group">
            <button
              onClick={() => setShowPriorityMenu(!showPriorityMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all shadow-sm hover:shadow-md ${
                currentPriority === "HIGH"
                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                  : currentPriority === "MEDIUM"
                    ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                    : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
              }`}
            >
              {/* ICON: HIGH */}
              {currentPriority === "HIGH" && (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              )}
              {/* ICON: MEDIUM */}
              {currentPriority === "MEDIUM" && (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12h14"
                  />
                </svg>
              )}
              {/* ICON: LOW */}
              {currentPriority === "LOW" && (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              )}

              <span className="uppercase tracking-wide">{currentPriority}</span>

              <svg
                className={`w-3 h-3 ml-0.5 opacity-60 transition-transform duration-200 ${showPriorityMenu ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* DROPDOWN MENU */}
            {showPriorityMenu && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden z-[9999] ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                <div className="p-1">
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
                    <button
                      key={priority}
                      onClick={() => {
                        onChangePriority?.(priority);
                        setShowPriorityMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 text-[11px] font-bold rounded-lg flex items-center gap-3 transition-colors ${
                        priority === "HIGH"
                          ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          : priority === "MEDIUM"
                            ? "text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                            : "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      }`}
                    >
                      {/* ICON REPEAT FOR MENU */}
                      {priority === "HIGH" && (
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
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      )}
                      {priority === "MEDIUM" && (
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
                            d="M5 12h14"
                          />
                        </svg>
                      )}
                      {priority === "LOW" && (
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
                            d="M19 14l-7 7m0 0l-7-7m7 7V3"
                          />
                        </svg>
                      )}
                      {priority}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. Direct Actions (Hidden on Mobile, moved to Menu) */}
          <div className="hidden md:flex items-center gap-2 border-l border-gray-200 dark:border-reply-border-dark pl-2 ml-2">
            {onTransfer && (
              <button
                onClick={onTransfer}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                title="Transferir"
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
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* 3. Primary Action: Resolve (Hidden on Mobile, moved to Menu) */}
          <button
            onClick={onResolve}
            className={`
              hidden md:flex items-center gap-2 px-3 sm:px-4 py-1.5 
              bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700  
              text-white rounded-lg text-xs font-bold shadow-md shadow-green-500/20 
              transition-all transform hover:scale-105 active:scale-95
              ${isTightMode ? "aspect-square p-2 justify-center" : ""}
            `}
            title="Resolver Ticket"
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            {!isTightMode && <span>Resolver</span>}
          </button>

          {/* 4. Dropdown Menu (Secondary Actions) */}
          <ActionMenu />

          {/* 5. Right Sidebar Toggles (Hidden on Mobile) */}
          <div className="hidden md:flex items-center gap-1 border-l border-gray-200 dark:border-reply-border-dark pl-2 ml-1">
            {onToggleParticipantsPanel && (
              <button
                onClick={onToggleParticipantsPanel}
                className={`p-2 rounded-lg transition-all ${isParticipantsPanelVisible ? "bg-indigo-50 text-indigo-600" : "text-gray-400 hover:bg-gray-100"}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
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
                className={`p-2 rounded-lg transition-all ${isCustomer360Visible ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:bg-gray-100"}`}
              >
                <svg
                  className={`w-5 h-5 transition-transform ${!isCustomer360Visible ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* 🏷️ TAGS BAR: Dedicated scrollable row below header */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-100 dark:border-reply-border-dark px-3 sm:px-4 py-0.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full h-7 shrink-0 z-20 transition-all">
          <div className="flex-shrink-0 text-[9px] font-bold text-gray-400/80 uppercase tracking-widest mr-1 select-none">
            Etiquetas
          </div>
          {contact.tags.map((tagId: string) => {
            const tag = availableTags.find(
              (t) => t.id === tagId || t.name === tagId,
            );
            if (!tag) return null;
            return (
              <span
                key={tagId}
                className={`px-2 py-[1px] rounded text-[9px] font-bold shadow-sm border border-black/5 whitespace-nowrap shrink-0 flex items-center gap-1 hover:scale-105 transition-transform cursor-default ${tag.color || "bg-white text-gray-600 border-gray-200"}`}
              >
                {tag.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
export const ChatHeaderEnhanced = React.memo(ChatHeaderEnhancedComponent);
