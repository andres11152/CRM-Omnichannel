import React, { useState, useEffect, useRef } from "react";
import { Contact, Tag } from "../types";

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
}

export const ChatHeaderEnhanced: React.FC<ChatHeaderEnhancedProps> = ({
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
}) => {
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const isTightMode = isChatListVisible && isCustomer360Visible; // 🧠 Detect "Tight Mode" (Both Panels Open)

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
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800";
    }
  };

  // 🛠️ HELPER: Premium Dropdown Menu
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
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        ),
        label: "Transferir Ticket",
        onClick: onTransfer,
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
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 transition-all hover:shadow-sm active:scale-95"
          title="Más Acciones"
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
          <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#202c33] rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-[100]">
            <div className="py-1">
              {menuItems
                .filter((i) => i.visible)
                .map((item, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      item.onClick();
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors"
                  >
                    <span className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
            </div>

            {/* Priority Selector Inside Dropdown for Ultra-Compact Mode */}
            {isTightMode && (
              <div className="border-t border-gray-100 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800/50">
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
    <>
      <div className="bg-white dark:bg-[#202c33] px-3 sm:px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0 relative shadow-sm h-[60px] z-30">
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
            className="flex items-center gap-2 sm:gap-3 group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-1 rounded-lg transition-colors overflow-hidden"
            onClick={onEditContact}
          >
            <div
              className={`relative shrink-0 ${isChatListVisible && isCustomer360Visible ? "hidden 2xl:block" : "block"}`}
            >
              <img
                src={
                  contact.profilePicUrl ||
                  contact.avatarUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=random`
                }
                alt={contact.name}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-gray-600 shadow-sm"
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

              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 h-5">
                {isTyping ? (
                  <span className="text-green-500 font-bold animate-pulse">
                    escribiendo...
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5 overflow-hidden w-full">
                    {contact.tags && contact.tags.length > 0 ? (
                      <>
                        {contact.tags
                          .slice(0, isTightMode ? 1 : 3)
                          .map((tagId: string) => {
                            const tag = availableTags.find(
                              (t) => t.id === tagId || t.name === tagId,
                            );
                            if (!tag) return null;
                            return (
                              <span
                                key={tagId}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm whitespace-nowrap ${tag.color || "bg-gray-200 text-gray-700"}`}
                              >
                                {tag.name}
                              </span>
                            );
                          })}
                        {contact.tags.length > (isTightMode ? 1 : 3) && (
                          <span className="text-[9px] bg-gray-100 px-1 rounded">
                            +{contact.tags.length - (isTightMode ? 1 : 3)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] italic opacity-60">
                        Sin etiquetas
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Actions Toolbar */}
        <div className="flex items-center gap-1 sm:gap-2 pl-2">
          {/* 1. SLA & Priority (Hidden in Ultra Tight Mode, Moved to Dropdown) */}
          {!isTightMode && (
            <div className="flex items-center gap-2 hidden lg:flex">
              {ticketCreatedAt && (
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div
                    className={`w-2 h-2 rounded-full ${getSLAColor()}`}
                  ></div>
                  <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">
                    {timeElapsed}m
                  </span>
                </div>
              )}

              <div className="relative">
                <button
                  onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${getPriorityColor(currentPriority)}`}
                >
                  {currentPriority === "HIGH" && "🔴"}
                  {currentPriority === "MEDIUM" && "🟡"}
                  {currentPriority === "LOW" && "🔵"}
                  <span className="ml-1">{currentPriority}</span>
                  <svg
                    className="w-2.5 h-2.5 ml-1 opacity-50"
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
                {showPriorityMenu && (
                  <div className="absolute right-0 top-full mt-2 w-32 bg-white dark:bg-[#202c33] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-[100]">
                    {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
                      <button
                        key={priority}
                        onClick={() => {
                          onChangePriority?.(priority);
                          setShowPriorityMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                      >
                        {priority === "HIGH" && "🔴"}{" "}
                        {priority === "MEDIUM" && "🟡"}{" "}
                        {priority === "LOW" && "🔵"}
                        {priority}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. Direct Actions (Visible in Normal Mode) */}
          {!isTightMode && (
            <div className="hidden md:flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-2 ml-2">
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
          )}

          {/* 3. Primary Action: Resolve (Always Visible but Compact in Tight Mode) */}
          <button
            onClick={onResolve}
            className={`
              flex items-center gap-2 px-3 sm:px-4 py-2 
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

          {/* 5. Right Sidebar Toggles */}
          <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-2 ml-1">
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
    </>
  );
};
