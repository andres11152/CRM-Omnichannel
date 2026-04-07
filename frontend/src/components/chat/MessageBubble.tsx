import React, { useState } from "react";
import { Message } from "@/types";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Plus, Smile, Reply } from "lucide-react";

interface MessageBubbleProps {
  message: Message;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, reaction: string) => void;
  onQuoteClick?: () => void | null;
  isGroup?: boolean;
}

/**
 * MESSAGE BUBBLE COMPONENT
 * Renders individual message bubble with different styles for agent/customer
 *  Memoized to prevent re-renders during optimistic update reconciliation
 */
const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  onReply,
  onReact,
  onQuoteClick,
  isGroup,
}) => {
  const isOutbound = message.direction === "OUTBOUND" || message.sender === "agent";
  const isAgent = isOutbound;
  const isSystem = message.sender === "system";
  const [showPicker, setShowPicker] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);

  // Extract actual sender name from possible backend populated relations
  const senderNameObj = (message as any).sender;
  const rawSenderName = message.senderName || (typeof senderNameObj === "object" ? (senderNameObj?.name || senderNameObj?.phone) : undefined);
  const displaySenderName = typeof rawSenderName === "string" ? rawSenderName : undefined;

  // [SEC] Detect dark mode for inline style fallback
  const isDark =
    (typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches) ||
    document.documentElement.classList.contains("dark");

  const handleReact = (emoji: string) => {
    if (onReact) onReact(message.id, emoji);
    setShowPicker(false);
  };

  // System messages (e.g., "Ticket resolved")
  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-lg text-sm max-w-md text-center">
          {message.content}
        </div>
      </div>
    );
  }

  const reactions = message.reactions || [];
  
  // Consistent color gen for group participant names
  const stringToHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return hash;
  };
  const colors = ["#e542a3", "#029d00", "#3498db", "#e67e22", "#9b59b6", "#1abc9c", "#e74c3c"];
  const nameColor = displaySenderName ? colors[Math.abs(stringToHash(displaySenderName)) % colors.length] : undefined;

  return (
    <div className={`flex ${isAgent ? "justify-end" : "justify-start"} group/row relative py-1`}>
      <div
        className={`flex flex-col max-w-[85%] md:max-w-[70%] ${
          isAgent ? "items-end" : "items-start"
        } relative`}
      >
        {/* Action Overlay (Floating) */}
        {!isSystem && (
          <div
            className={`absolute top-0 ${isAgent ? "-left-14" : "-right-14"} hidden group-hover/row:flex items-center gap-1 z-20 transition-all opacity-0 group-hover/row:opacity-100 p-1 animate-in slide-in-from-${isAgent ? 'right' : 'left'}-2 duration-200`}
          >
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="p-2 rounded-full bg-white dark:bg-[#1f2c34] hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 transition-all shadow-sm border border-gray-100 dark:border-white/10 active:scale-90"
              title="Reaccionar"
            >
              <Smile className="w-4 h-4" />
            </button>
            <button
              onClick={() => onReply && onReply(message)}
              className="p-2 rounded-full bg-white dark:bg-[#1f2c34] hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 transition-all shadow-sm border border-gray-100 dark:border-white/10 active:scale-90"
              title="Responder"
            >
              <Reply className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Reaction Picker Popover (Enterprise Polish) */}
        {showPicker && (
          <div
            className={`absolute bottom-full mb-3 ${isAgent ? "right-0" : "left-0"} z-50 bg-white/90 dark:bg-[#1f2c34]/95 backdrop-blur-xl rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-200/50 dark:border-white/10 p-1.5 flex items-center gap-1.5 animate-in fade-in zoom-in-90 slide-in-from-bottom-2 duration-200`}
          >
            {["❤️", "👍", "😂", "😮", "😢", "🙏"].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className="text-xl hover:scale-125 hover:-translate-y-1 active:scale-95 transition-all duration-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
            <div className="w-px h-6 bg-gray-200 dark:bg-white/10 mx-0.5" />
            <button
              onClick={() => {
                setShowFullPicker(true);
                setShowPicker(false);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-600 text-gray-500 dark:text-gray-400 transition-all duration-200 shadow-sm"
              title="Más emojis"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* [NEW] Full Emoji Picker Overlay */}
        {showFullPicker && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setShowFullPicker(false)}>
            <div className="relative animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
               <EmojiPicker 
                 theme={isDark ? Theme.DARK : Theme.LIGHT}
                 onEmojiClick={(emojiData) => {
                   handleReact(emojiData.emoji);
                   setShowFullPicker(false);
                 }}
               />
            </div>
          </div>
        )}

        {/* AI Bot Badge */}
        {isAgent && ((message as any).senderName?.toLowerCase() === "bot" || (message as any).senderType === "BOT") && (
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mb-1 flex items-center gap-1 ml-auto">
             [AI] Agente IA
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`rounded-2xl px-4 py-2 shadow-md transition-all relative group ${
            isAgent ? "rounded-br-none" : "rounded-bl-none border"
          }`}
          style={
            isAgent
              ? { backgroundColor: "#00a884", color: "#ffffff" }
              : isDark
                ? {
                    backgroundColor: "#202c33",
                    color: "#e9edef",
                    borderColor: "#2a3942",
                  }
                : {
                    backgroundColor: "#ffffff",
                    color: "#111b21",
                    borderColor: "#e9edef",
                  }
          }
        >
          {/* Group Sender Name (Inside Bubble) - ONLY for groups */}
          {!isAgent && isGroup && displaySenderName && (
            <div 
              className="text-[13px] font-bold mb-1 line-clamp-1" 
              style={{ color: nameColor || "#e542a3" }}
            >
              {displaySenderName}
            </div>
          )}
          {/* Quoted Message (Reply Context) */}
          {message.metadata?.quotedMessageId && (
            <div
              className={`mb-2 p-2 rounded-lg border-l-4 bg-black/5 dark:bg-white/5 ${isAgent ? "border-white/40" : "border-indigo-500"} cursor-pointer hover:opacity-80 transition-opacity`}
              onClick={() => onQuoteClick && onQuoteClick()}
            >
              <div
                className={`text-[10px] font-bold mb-0.5 ${isAgent ? "text-white/80" : "text-indigo-600 dark:text-indigo-400"}`}
              >
                {(message.metadata as any).quotedContent ? "Respondiendo a:" : "Respondiendo a mensaje multimedia"}
              </div>
              <div
                className={`text-xs italic line-clamp-2 ${isAgent ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}
              >
                {(message.metadata as any).quotedContent || "Haga clic para ver el original"}
              </div>
            </div>
          )}

          {/* Media Content */}
          {(message.type === "image" || (message.type as string) === "image_unavailable") && (
            message.mediaUrl ? (
              <img
                src={message.mediaUrl}
                alt="Imagen"
                className="rounded-lg mb-2 max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.mediaUrl, "_blank")}
              />
            ) : (
              <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-lg mb-2 border border-dashed border-gray-300 dark:border-gray-600">
                <span className="text-xl"></span>
                <span className="text-xs text-gray-500 italic">
                  Imagen no disponible
                </span>
              </div>
            ))}

          {(message.type === "video" || (message.type as string) === "video_unavailable") && (
            message.mediaUrl ? (
              <video
                src={message.mediaUrl}
                controls
                className="rounded-lg mb-2 max-w-full h-auto"
              />
            ) : (
              <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-lg mb-2 border border-dashed border-gray-300 dark:border-gray-600">
                <span className="text-xl"></span>
                <span className="text-xs text-gray-500 italic">
                  Video no disponible
                </span>
              </div>
            ))}

          {(message.type === "audio" || (message.type as string) === "audio_unavailable") && (
            message.mediaUrl ? (
              <audio
                src={message.mediaUrl}
                controls
                className="mb-2 max-w-full"
              />
            ) : (
              <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-lg mb-2 border border-dashed border-gray-300 dark:border-gray-600">
                <span className="text-xl"></span>
                <span className="text-xs text-gray-500 italic">
                  Audio no disponible
                </span>
              </div>
            ))}

          {(message.type === "document" || (message.type as string) === "document_unavailable") && (
            message.mediaUrl ? (
              <a
                href={message.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg mb-2 border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium truncate">
                    Descargar archivo
                  </span>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-lg mb-2 border border-dashed border-gray-300 dark:border-gray-600">
                <span className="text-xl"></span>
                <span className="text-xs text-gray-500 italic">
                  Archivo no disponible
                </span>
              </div>
            ))}

          {/* Text Content & Specialized Renderers */}
          {message.content && (() => {
            const content = message.content;
            
            // ️ SCHEDULED MESSAGE
            if (content.includes("MENSAJE PROGRAMADO:") || (message as any).status === "SCHEDULED") {
              let realMsg = content;
              let dateDisplay = "Programado";

              if (content.includes("MENSAJE PROGRAMADO:")) {
                const lines = content.split("\n\n");
                realMsg = lines[1] || "";
                dateDisplay = lines[2]?.replace("Para: ", "").replace(" ", "") || "";
              } else if (message.metadata?.scheduledAt) {
                dateDisplay = new Date(message.metadata.scheduledAt as string).toLocaleString();
              }

              return (
                <div className="bg-amber-50/10 p-3 rounded-lg border border-amber-200/30 my-1">
                  <div className="flex items-center gap-2 mb-2 border-b border-amber-200/20 pb-1">
                    <span className="text-amber-500">⏰</span>
                    <span className="font-bold text-amber-200 text-[10px] uppercase tracking-wider">Programado</span>
                  </div>
                  <p className="italic text-sm mb-2 opacity-90">"{realMsg}"</p>
                  <div className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded w-fit">{dateDisplay}</div>
                </div>
              );
            }

            //  PAYMENT REQUEST
            if (content.includes(" *SOLICITUD DE PAGO*")) {
              return (
                <div className="bg-white/10 p-3 rounded-lg border border-white/20 my-1">
                   <div className="flex items-center gap-2 mb-2">
                    <span className="text-emerald-400 font-bold"> Pago Solicitado</span>
                  </div>
                  <p className="text-sm opacity-90 mb-3">{content.replace(" *SOLICITUD DE PAGO*", "").trim()}</p>
                  <button className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs transition-colors shadow-sm">
                    Pagar Ahora
                  </button>
                </div>
              );
            }

            //  DATA REQUEST
            if (content.includes(" *SOLICITUD DE DATOS*")) {
              return (
                <div className="bg-teal-500/10 p-3 rounded-lg border border-teal-500/30 my-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-teal-400 font-bold"> Datos Requeridos</span>
                  </div>
                  <p className="text-sm opacity-90">{content.replace(" *SOLICITUD DE DATOS*", "").trim()}</p>
                </div>
              );
            }

            // DEFAULT TEXT
            return (
              <p
                className="whitespace-pre-wrap"
                style={{
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}
              >
                {content}
              </p>
            );
          })()}

          {/* Floating Reactions List (Subtle Enterprise Style) */}
          {reactions.length > 0 && (
            <div
              className={`absolute -bottom-2 ${isAgent ? "right-1" : "left-1"} flex items-center bg-white/90 dark:bg-[#1f2c34]/90 backdrop-blur-md rounded-full px-1.5 py-0.5 shadow-sm border border-gray-100 dark:border-white/10 z-20 transition-all hover:scale-105 hover:shadow-md cursor-pointer group/reacts`}
            >
              <div className="flex items-center -space-x-0.5">
                {Array.from(new Set(reactions.map((r) => r.content))).slice(0, 3).map((emoji, idx) => {
                  const myReact = reactions.find(r => r.content === emoji && (r.reactBy === 'me' || (r as any).isMe));
                  const hasMyReact = !!myReact;
                  
                  return (
                    <span 
                      key={idx} 
                      className={`text-[11px] leading-none p-0.5 rounded-full transition-all ${hasMyReact ? 'bg-indigo-500/10 scale-110' : ''}`}
                      title={hasMyReact ? "Haz clic para quitar tu reacción" : "Reacción"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReact(emoji);
                      }}
                    >
                      {emoji}
                    </span>
                  );
                })}
              </div>
              {reactions.length > 1 && (
                <span className="text-[9px] ml-1 text-gray-500 dark:text-gray-400 font-bold pr-0.5">
                  {reactions.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timestamp and Status */}
        <div
          className={`flex items-center gap-2 mt-1 ${isAgent ? "justify-end" : "justify-start"}`}
        >
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(message.timestamp)}
          </span>

          {/* Message Status (only for agent messages) */}
          {isAgent && message.status && (
            <MessageStatus status={message.status} />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * MESSAGE STATUS INDICATOR
 */
const MessageStatus: React.FC<{ status: Message["status"] }> = ({ status }) => {
  const getStatusIcon = () => {
    switch (status) {
      case "sending":
        return (
          <svg className="w-3 h-3 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        );
      case "sent":
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case "delivered":
        return (
          <div className="flex -space-x-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
        );
      case "read":
        return (
          <div className="flex -space-x-1">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
        );
      case "failed":
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return <div className="flex items-center">{getStatusIcon()}</div>;
};

/**
 * HELPER: Format timestamp
 */
const formatTime = (timestamp: string | Date): string => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  
  // Check for Invalid Date
  if (isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("es-ES", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: false 
    });
  }

  return date.toLocaleDateString("es-ES", { 
    day: "2-digit", 
    month: "2-digit",
    year: "2-digit" 
  }) + " " + date.toLocaleTimeString("es-ES", { 
    hour: "2-digit", 
    minute: "2-digit",
    hour12: false 
  });
};

/**
 *  100-YEAR FIX: Memoization
 */
export const MessageBubble = React.memo(
  MessageBubbleComponent,
  (prevProps, nextProps) => {
    const prev = prevProps.message;
    const next = nextProps.message;

    if (prev.id !== next.id) return false;
    if (prev.status !== next.status) return false;
    if (prev.content !== next.content) return false;
    if (JSON.stringify(prev.reactions) !== JSON.stringify(next.reactions)) return false;
    
    if (Math.abs(new Date(prev.timestamp).getTime() - new Date(next.timestamp).getTime()) > 1000) {
      return false;
    }

    if (prevProps.isGroup !== nextProps.isGroup) return false;

    return true;
  },
);

