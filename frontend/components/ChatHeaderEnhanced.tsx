import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Contact } from "../types";

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
  availableTags?: any[]; // Receives tag definitions
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

  // Content for the Portal (Global Actions)
  const renderActions = () => (
    <div className="flex items-center gap-2 w-full h-full justify-end md:justify-center animate-fade-in px-2">
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

      {/* 4. Quick Actions (Tag, Copy) - DESKTOP VIEW */}
      <div className="hidden md:flex items-center gap-1">
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
        {socketStatus === "disconnected" && (
          <button
            onClick={onForceReconnect}
            className="p-1.5 bg-red-50 text-red-600 rounded-lg"
            title="Reconectar"
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
        <button
          onClick={onCopyChat}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
          title="Copiar"
        >
          {isCopied ? (
            <svg
              className="w-4 h-4 text-green-500"
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
          ) : (
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
                d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
              />
            </svg>
          )}
        </button>
        <button
          onClick={onTagsClick}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
          title="Etiquetas"
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
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
        </button>
      </div>

      {/* NEW: Transfer/Resolve Buttons (Unified) - DESKTOP VIEW */}
      <div className="hidden md:flex items-center">
        {onEmail && (
          <button
            onClick={onEmail}
            className="ml-2 flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1 rounded-lg transition-colors text-[10px] font-bold shadow-sm"
            title="Enviar Email"
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span>Email</span>
          </button>
        )}

        <button
          onClick={onTransfer}
          className="ml-2 flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg transition-colors text-[10px] font-bold shadow-sm shadow-blue-500/20"
          title="Transferir o Asignar"
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
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
          <span>Transferir</span>
        </button>

        <button
          onClick={onResolve}
          className="ml-2 flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg transition-colors text-[10px] font-bold shadow-sm shadow-green-500/20"
          title="Resolver y Cerrar"
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
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Resolver</span>
        </button>

        {onToggleCustomer360 && (
          <button
            onClick={onToggleCustomer360}
            className="ml-2 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
            title={
              isCustomer360Visible
                ? "Ocultar Customer 360"
                : "Mostrar Customer 360"
            }
          >
            {isCustomer360Visible ? (
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
                  d="M13 5l7 7-7 7"
                />
              </svg>
            ) : (
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
                  d="M11 5l-7 7 7 7"
                />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* 📱 MOBILE ACTIONS MENU (KEBAB) */}
      <div className="md:hidden relative ml-auto flex items-center gap-2">
        {socketStatus === "disconnected" && (
          <button
            onClick={onForceReconnect}
            className="p-1.5 bg-red-50 text-red-600 rounded-lg animate-pulse"
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}

        <div className="relative group">
          <button className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
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
          {/* Dropdown Content */}
          <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#202c33] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden z-[999] opacity-0 invisible group-focus-within:opacity-100 group-focus-within:visible transition-all transform origin-top-right">
            <div className="py-1">
              <button
                onClick={onResolve}
                className="w-full text-left px-4 py-3 text-sm font-bold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2"
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
                Resolver Chat
              </button>
              {onEmail && (
                <button
                  onClick={onEmail}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
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
                  Enviar Email
                </button>
              )}
              <button
                onClick={onTransfer}
                className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
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
                Transferir
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
              <button
                onClick={onTagsClick}
                className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
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
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
                Etiquetas
              </button>
              <button
                onClick={onCopyChat}
                className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
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
                    d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                  />
                </svg>
                Copiar Chat
              </button>
              {onToggleCustomer360 && (
                <button
                  onClick={onToggleCustomer360}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"
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
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Ver Detalles (360°)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* 🟢 LOCAL HEADER: Just Contact Identity */}
      <div className="bg-white dark:bg-[#202c33] px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0 relative shadow-sm h-[52px]">
        {/* Left: Contact Info + Toggle Chat List */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onToggleChatList && (
            <button
              onClick={onToggleChatList}
              className="hidden md:block p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0"
              title={
                isChatListVisible
                  ? "Ocultar lista de chats"
                  : "Mostrar lista de chats"
              }
            >
              {isChatListVisible ? (
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
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                </svg>
              ) : (
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
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                </svg>
              )}
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

          <img
            src={
              contact.profilePicUrl ||
              contact.avatarUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=random`
            }
            alt={contact.name}
            className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=random`;
            }}
          />

          <div className="min-w-0 flex flex-col justify-center">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-gray-900 dark:text-white font-bold text-sm truncate leading-tight">
                {contact.name}
              </h2>

              {/* 🏷️ TAGS DISPLAY (100-Year Fix: Limit visible tags) */}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  {(() => {
                    const tags = contact.tags;
                    const MAX_VISIBLE_HEADER = 3;
                    const visibleTags = tags.slice(0, MAX_VISIBLE_HEADER);
                    const hiddenTags = tags.slice(MAX_VISIBLE_HEADER);
                    const hiddenCount = tags.length - MAX_VISIBLE_HEADER;

                    return (
                      <>
                        {visibleTags.map((tagIdOrObj: any) => {
                          const tagId =
                            typeof tagIdOrObj === "string"
                              ? tagIdOrObj
                              : tagIdOrObj.id;
                          const tagDef = availableTags.find(
                            (t) => t.id === tagId,
                          );
                          const name =
                            tagDef?.name ||
                            (typeof tagIdOrObj === "object"
                              ? tagIdOrObj.name
                              : tagId);
                          const color =
                            tagDef?.color ||
                            (typeof tagIdOrObj === "object"
                              ? tagIdOrObj.color
                              : "bg-gray-500");

                          if (!tagDef && typeof tagIdOrObj === "string")
                            return null;

                          return (
                            <span
                              key={tagId}
                              className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm font-bold text-white shadow-sm truncate max-w-[80px] ${color}`}
                            >
                              {name}
                            </span>
                          );
                        })}
                        {hiddenCount > 0 && (
                          <div className="relative group z-50">
                            <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-sm shadow-sm cursor-help">
                              +{hiddenCount}
                            </span>
                            {/* Rich Tooltip for Header */}
                            <div className="absolute top-full left-0 mt-2 w-max max-w-[200px] bg-white dark:bg-[#1f2937] p-2.5 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-600 hidden group-hover:flex flex-col gap-1.5 z-[999] opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto">
                              <div className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider mb-0.5 px-0.5 border-b border-gray-100 dark:border-gray-600 pb-1">
                                Restantes
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {hiddenTags.map((tagIdOrObj: any) => {
                                  const tagId =
                                    typeof tagIdOrObj === "string"
                                      ? tagIdOrObj
                                      : tagIdOrObj.id;
                                  const tagDef = availableTags.find(
                                    (t) => t.id === tagId,
                                  );
                                  const name =
                                    tagDef?.name ||
                                    (typeof tagIdOrObj === "object"
                                      ? tagIdOrObj.name
                                      : tagId);
                                  const color =
                                    tagDef?.color ||
                                    (typeof tagIdOrObj === "object"
                                      ? tagIdOrObj.color
                                      : "bg-gray-500");
                                  return (
                                    <span
                                      key={tagId}
                                      className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm font-bold text-white shadow-sm ${color}`}
                                    >
                                      {name}
                                    </span>
                                  );
                                })}
                              </div>
                              {/* Arrow (Upward) */}
                              <div className="absolute -top-1.5 left-2 w-3 h-3 bg-white dark:bg-[#1f2937] border-t border-l border-gray-100 dark:border-gray-600 transform rotate-45"></div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              <button
                onClick={onEditContact}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-50 hover:opacity-100 transition-opacity"
                title="Editar Información"
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
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
              {isTyping ? (
                <span className="text-green-500 font-bold animate-pulse">
                  escribiendo...
                </span>
              ) : (
                <>
                  <span className="capitalize">{contact.channel}</span>
                  <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                  <span
                    className={
                      socketStatus === "connected"
                        ? "text-green-500"
                        : "text-red-500"
                    }
                  >
                    {socketStatus}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 GLBOAL PORTAL ACTIONS: Move to Top Bar */}
      {portalTarget && createPortal(renderActions(), portalTarget)}
    </>
  );
};
