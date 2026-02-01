import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [slaStatus, setSlaStatus] = useState<"ok" | "warning" | "critical">(
    "ok",
  );
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Buscar el contenedor en el Top Bar
    setPortalTarget(document.getElementById("header-actions-portal"));
  }, []);

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

  // Content for the Portal (Global Actions) - STATUS ONLY
  const renderGlobalStatus = () => (
    <div className="flex items-center gap-2 w-full h-full justify-end animate-fade-in px-2">
      {/* 1. SLA Indicator */}
      {ticketCreatedAt && (
        <div className="hidden lg:flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 mr-2">
          <div
            className={`w-2.5 h-2.5 rounded-full border-2 ${getSLAColor()}`}
          ></div>
          <div className="text-[10px]">
            <span className="font-bold text-gray-700 dark:text-gray-300">
              {timeElapsed}m
            </span>
            <span className="text-gray-400 dark:text-gray-500">
              {" "}
              / {responseTimeSLA}m
            </span>
          </div>
        </div>
      )}

      {/* 2. Priority Selector */}
      <div className="relative">
        <button
          onClick={() => setShowPriorityMenu(!showPriorityMenu)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${getPriorityColor(currentPriority)}`}
          title="Cambiar Prioridad"
        >
          {currentPriority === "HIGH" && "🔴"}
          {currentPriority === "MEDIUM" && "🟡"}
          {currentPriority === "LOW" && "🔵"}
          <span className="hidden sm:inline">{currentPriority}</span>
          <svg
            className="w-2.5 h-2.5"
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
          <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#202c33] rounded-xl shadow-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden z-[100]">
            <div className="p-2 space-y-1">
              {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
                <button
                  key={priority}
                  onClick={() => {
                    onChangePriority?.(priority);
                    setShowPriorityMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left`}
                >
                  <span className="text-lg">
                    {priority === "HIGH" && "🔴"}
                    {priority === "MEDIUM" && "🟡"}
                    {priority === "LOW" && "🔵"}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                      {priority}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* 🟢 UNIFIED CHAT HEADER */}
      <div className="bg-white dark:bg-[#202c33] px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0 relative shadow-sm h-[60px] z-30">
        {/* LEFT: Sidebar Toggle & Identity */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
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
            className="flex items-center gap-3 group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 p-1.5 rounded-lg transition-colors"
            onClick={onEditContact}
          >
            <div
              className={`relative ${isChatListVisible && isCustomer360Visible ? "hidden 2xl:block" : "block"}`}
            >
              <img
                src={
                  contact.profilePicUrl ||
                  contact.avatarUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=random`
                }
                alt={contact.name}
                className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-600 shadow-sm"
              />
              <div
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-[#202c33] ${socketStatus === "connected" ? "bg-green-500" : "bg-red-500"}`}
              ></div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-gray-900 dark:text-white font-bold text-sm truncate max-w-[150px] lg:max-w-[250px]">
                  {contact.name}
                </h2>
                {contact.channel && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase shrink-0">
                    {contact.channel}
                  </span>
                )}
                {/* 🛠️ Clean Actions: Copy & Edit */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyChat();
                    }}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title="Copiar Historial"
                  >
                    {isCopied ? (
                      <span className="text-green-500 font-bold text-[10px]">
                        COPIADO
                      </span>
                    ) : (
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
                          d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagsClick();
                    }}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title="Gestionar Etiquetas"
                  >
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
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {isTyping ? (
                  <span className="text-green-500 font-bold animate-pulse">
                    escribiendo...
                  </span>
                ) : (
                  (() => {
                    // 🧠 DYNAMIC LAYOUT LOGIC:
                    // Maximize tag visibility when space allows (Panel 360 Closed)
                    const is360Closed = !isCustomer360Visible;
                    const isChatListClosed = !isChatListVisible;

                    // Width Strategy
                    const dynamicMaxWidth = is360Closed
                      ? "max-w-[600px] lg:max-w-[800px]" // Huge space if 360 closed
                      : "max-w-[200px] lg:max-w-[350px]"; // Tight space if 360 open

                    // Count Strategy
                    let maxVisibleTags = 2; // Default strict (Safe Mode)
                    if (is360Closed) maxVisibleTags = 6; // Relaxed
                    if (is360Closed && isChatListClosed) maxVisibleTags = 8; // Ultra Wide

                    // Semi-compact adjustment (Laptop with 1 panel open)
                    if (isCustomer360Visible && !isChatListVisible)
                      maxVisibleTags = 3;

                    return (
                      <div
                        className={`flex items-center gap-1.5 flex-nowrap overflow-hidden ${dynamicMaxWidth} mask-gradient-r transition-all duration-300`}
                      >
                        {/* 🏷️ 100-Year Solution: Visible Tag Badges for Customer Context */}
                        {contact.tags && contact.tags.length > 0 ? (
                          <>
                            {contact.tags
                              .slice(0, maxVisibleTags) // Dynamic limit
                              .map((tagId: string, index: number) => {
                                // Resolve tag data from availableTags
                                const tag = availableTags.find(
                                  (t) => t.id === tagId || t.name === tagId,
                                );

                                // Debug: Log if tags aren't matching
                                if (!tag && index === 0) {
                                  // Silent debug for dev
                                }

                                // Fallback: If tag not found, show generic badge
                                if (!tag) {
                                  return (
                                    <span
                                      key={tagId}
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 whitespace-nowrap"
                                      title={`Tag ID: ${tagId}`}
                                    >
                                      🏷️ {tagId.substring(0, 8)}...
                                    </span>
                                  );
                                }

                                return (
                                  <span
                                    key={tagId}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm whitespace-nowrap ${tag.color || "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}
                                    title={tag.name}
                                  >
                                    {tag.name}
                                  </span>
                                );
                              })}
                            {contact.tags.length > maxVisibleTags && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTagsClick();
                                }}
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors cursor-pointer whitespace-nowrap"
                                title="Ver todas las etiquetas"
                              >
                                +{contact.tags.length - maxVisibleTags}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onTagsClick();
                            }}
                            className="text-gray-400 hover:text-blue-500 transition-colors cursor-pointer flex items-center gap-1"
                            title="Agregar etiquetas"
                          >
                            <svg
                              className="w-3 h-3"
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
                            Agregar etiquetas
                          </button>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Actions Toolbar */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* 0. SLA & Priority (Always Visible) */}
          <div className="flex items-center gap-2 mr-2">
            {/* SLA Indicator */}
            {ticketCreatedAt && (
              <div className="hidden lg:flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700">
                <div
                  className={`w-2.5 h-2.5 rounded-full border-2 ${getSLAColor()}`}
                ></div>
                <div className="text-[10px]">
                  <span className="font-bold text-gray-700 dark:text-gray-300">
                    {timeElapsed}m
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">
                    {" "}
                    / {responseTimeSLA}m
                  </span>
                </div>
              </div>
            )}

            {/* Priority Selector */}
            <div className="relative">
              <button
                onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${getPriorityColor(
                  currentPriority,
                )}`}
                title="Cambiar Prioridad"
              >
                {currentPriority === "HIGH" && "🔴"}
                {currentPriority === "MEDIUM" && "🟡"}
                {currentPriority === "LOW" && "🔵"}
                <span className="hidden sm:inline">{currentPriority}</span>
                <svg
                  className="w-2.5 h-2.5"
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
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#202c33] rounded-xl shadow-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden z-[100]">
                  <div className="p-2 space-y-1">
                    {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => (
                      <button
                        key={priority}
                        onClick={() => {
                          onChangePriority?.(priority);
                          setShowPriorityMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left`}
                      >
                        <span className="text-lg">
                          {priority === "HIGH" && "🔴"}
                          {priority === "MEDIUM" && "🟡"}
                          {priority === "LOW" && "🔵"}
                        </span>
                        <div>
                          <div className="text-sm font-bold text-gray-900 dark:text-white">
                            {priority}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 1. Quick Tools (Desktop) */}
          <div className="hidden md:flex items-center gap-1 mr-2">
            {/* Removed Redundant Buttons (Tags/Copy) as requested via "Better Handling" */}
          </div>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden md:block" />

          {/* 2. Primary Actions */}
          <div className="flex items-center gap-2">
            {onEmail && (
              <button
                onClick={onEmail}
                className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition-all border border-gray-200 dark:border-gray-700"
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
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span>Email</span>
              </button>
            )}

            <button
              onClick={onTransfer}
              className="hidden md:flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg text-xs font-bold transition-all border border-blue-100 dark:border-blue-900/30"
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
              <span>Transferir</span>
            </button>

            <button
              onClick={onResolve}
              className="hidden lg:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg text-xs font-bold shadow-md shadow-green-500/20 transition-all transform hover:scale-105 active:scale-95"
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
              <span>Resolver</span>
            </button>
          </div>

          {/* 3. Panel Toggles */}
          {onToggleParticipantsPanel && (
            <>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2" />
              <button
                onClick={onToggleParticipantsPanel}
                className={`
                       p-2 rounded-lg transition-all border
                       ${
                         isParticipantsPanelVisible
                           ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
                           : "bg-transparent text-gray-400 hover:text-gray-600 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700"
                       }
                    `}
                title="Participantes del Grupo"
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
            </>
          )}

          {onToggleCustomer360 && (
            <>
              {!onToggleParticipantsPanel && (
                <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2" />
              )}
              <button
                onClick={onToggleCustomer360}
                className={`
                       p-2 rounded-lg transition-all border
                       ${
                         isCustomer360Visible
                           ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                           : "bg-transparent text-gray-400 hover:text-gray-600 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700"
                       }
                    `}
                title="Panel Customer 360"
              >
                <svg
                  className={`w-5 h-5 transition-transform duration-300 ${!isCustomer360Visible ? "rotate-180" : ""}`}
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
            </>
          )}

          {/* Mobile Actions Menu */}
          <div className="md:hidden ml-1">
            <button className="p-2 text-gray-500 dark:text-gray-400">
              <svg
                className="w-6 h-6"
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
          </div>
        </div>
      </div>
    </>
  );
};
