import React, { useRef, useEffect, useState } from "react";
import { Message, SenderType } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { Clock, Pin, ChevronDown } from "lucide-react";

interface MessageStreamProps {
  messages: Message[];
  isTyping: boolean;
  isRemoteTyping: boolean;
  isSyncing: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
  scrollToMessage: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (msg: Message) => void;
  onImageClick?: (url: string) => void;
  isGroup?: boolean;
  pinnedMessage?: {
    id: string;
    content: string;
    senderId?: string;
  } | null;
}



const DateDivider: React.FC<{ timestamp: string | Date }> = ({ timestamp }) => {
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    if (isNaN(d.getTime())) return null;
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayDate = new Date(nowDate);
    yesterdayDate.setDate(nowDate.getDate() - 1);
    
    // User requested: "que no salgan las fechas si son del día" 
    if (dDate.getTime() === nowDate.getTime()) return null;
    
    if (dDate.getTime() === yesterdayDate.getTime()) return "Ayer";
    const diffTime = nowDate.getTime() - dDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 7 && diffDays > 0) {
      return d.toLocaleDateString("es-ES", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
    }
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "numeric", year: "numeric" });
  };

  const label = formatDate(timestamp);
  if (!label) return null;

  return (
    <div 
      className="flex items-center justify-center my-3 sticky z-10 pointer-events-none"
      style={{ top: 'var(--date-divider-top, 8px)' }}
    >
      <div className="bg-gray-100/80 dark:bg-[#1f2c34]/80 backdrop-blur-sm px-3 py-1 rounded shadow-sm text-[10.5px] text-gray-500 dark:text-gray-400 font-medium pointer-events-auto leading-none">
        {label}
      </div>
    </div>
  );
};

type RenderableItem = 
  | { type: 'single', message: Message }
  | { type: 'media-group', messages: Message[] };

export const MessageStream: React.FC<MessageStreamProps> = ({
  messages,
  isTyping,
  isRemoteTyping,
  isSyncing,
  chatEndRef,
  scrollToMessage,
  onReact,
  onReply,
  onImageClick,
  isGroup,
  pinnedMessage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Show button if we are more than 300px away from the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 300;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const groupedMessages = React.useMemo(() => {
    const groups: { [key: string]: Message[] } = {};
    messages.forEach((msg) => {
      const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
      const validDate = isNaN(date.getTime()) ? new Date() : date;
      const dateKey = validDate.toDateString();
      
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(msg);
    });
    return Object.entries(groups);
  }, [messages]);

  // Secondary grouping: Media batches (consecutive images from same sender)
  const processedMessages = React.useMemo(() => {
    return groupedMessages.map(([day, dayMessages]) => {
      const items: RenderableItem[] = [];
      let i = 0;
      while (i < dayMessages.length) {
        const msg = dayMessages[i];
        
        // Grouping criteria: 
        // 1. It's an image
        // 2. No text content (or just "[IMAGE]")
        // 3. Sender is same as previous/next
        const isImage = (msg.metadata?.media as any)?.type === 'image' || 
                        msg.content === '[IMAGE]' || 
                        msg.type === 'image';
        const hasNoText = !msg.content || msg.content === '[IMAGE]';

        if (isImage && hasNoText) {
          const group: Message[] = [msg];
          let j = i + 1;
          while (j < dayMessages.length) {
            const nextMsg = dayMessages[j];
            const nextIsImage = (nextMsg.metadata?.media as any)?.type === 'image' || 
                                nextMsg.content === '[IMAGE]' || 
                                nextMsg.type === 'image';
            const nextHasNoText = !nextMsg.content || nextMsg.content === '[IMAGE]';
            const sameSender = nextMsg.sender === msg.sender && nextMsg.direction === msg.direction;
            
            // Check if timestamps are close (within 1 minute)
            const closeTime = msg.timestamp && nextMsg.timestamp
              ? Math.abs(new Date(nextMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 60000
              : true;

            if (nextIsImage && nextHasNoText && sameSender && closeTime) {
              group.push(nextMsg);
              j++;
            } else {
              break;
            }
          }
          
          if (group.length > 1) {
            items.push({ type: 'media-group', messages: group });
            i = j;
            continue;
          }
        }
        
        items.push({ type: 'single', message: msg });
        i++;
      }
      return [day, items] as [string, RenderableItem[]];
    });
  }, [groupedMessages]);

  // [SEC] 100-YEAR FIX: ResizeObserver to handle images loading and height changes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current!;
      // If we are already near the bottom, stay at the bottom when height changes
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 400;
      if (isNearBottom) {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [chatEndRef]);

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2 relative bg-[#efeae2] dark:bg-[#0b141a] custom-scrollbar"
      >
        {/* [SEC] SYNC INDICATOR */}
        {isSyncing && (
          <div className="flex items-center justify-center py-2 sticky top-0 z-20 pointer-events-none">
            <div className="flex items-center gap-2 bg-indigo-50/90 dark:bg-indigo-900/40 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm text-[11px] font-bold text-indigo-600 dark:text-indigo-300 animate-pulse border border-indigo-200 dark:border-indigo-800 pointer-events-auto">
              <Clock className="w-3.5 h-3.5 animate-spin-slow" />
              Sincronizando historial...
            </div>
          </div>
        )}

        {/* PINNED MESSAGE BANNER — WhatsApp Style */}
        {pinnedMessage && (
          <div
            className="sticky top-0 z-20 mx-2 mb-2 cursor-pointer animate-in slide-in-from-top duration-300"
            onClick={() => {
              const el = document.getElementById(`msg-${pinnedMessage.id}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-emerald-400', 'ring-offset-1');
                setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-400', 'ring-offset-1'), 2000);
              }
            }}
          >
            <div className="flex items-center gap-3 bg-white/90 dark:bg-[#1f2c34]/90 backdrop-blur-md rounded-xl px-4 py-2.5 shadow-lg border border-gray-200/50 dark:border-white/10 transition-all hover:shadow-xl hover:bg-white dark:hover:bg-[#1f2c34] group">
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Pin className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5">
                  Mensaje Anclado
                </p>
                <p className="text-[12px] text-gray-700 dark:text-gray-300 font-medium truncate leading-tight">
                  {pinnedMessage.content || 'Multimedia'}
                </p>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                Toca para ver ↓
              </div>
            </div>
          </div>
        )}

        {processedMessages.map(([day, dayItems]) => (
          <div 
            key={day} 
            className="relative space-y-2"
            style={{ '--date-divider-top': pinnedMessage ? '70px' : '8px' } as React.CSSProperties}
          >
            {/* Section Header: Sticky per day */}
            <DateDivider timestamp={dayItems[0].type === 'single' ? dayItems[0].message.timestamp : dayItems[0].messages[0].timestamp} />
            
            {dayItems.map((item, idx) => (
              <MessageBubble
                key={item.type === 'single' ? item.message.id : `group-${item.messages[0].id}-${idx}`}
                message={item.type === 'single' ? item.message : item.messages[0]}
                groupedMessages={item.type === 'media-group' ? item.messages : undefined}
                isGroup={isGroup}
                onQuoteClick={() => {
                  const headMsg = item.type === 'single' ? item.message : item.messages[0];
                  if (headMsg.metadata?.quotedMessageId) {
                    scrollToMessage(headMsg.metadata.quotedMessageId as string);
                  }
                }}
                onReact={(id, emoji) => onReact(id, emoji)}
                onReply={() => onReply(item.type === 'single' ? item.message : item.messages[0])}
                onImageClick={onImageClick}
              />
            ))}
          </div>
        ))}

        {/* TYPING INDICATORS */}
        {isRemoteTyping && (
          <div className="flex items-start mb-4">
            <div className="bg-white dark:bg-[#1f2c34] px-4 py-2.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></span>
              </div>
            </div>
          </div>
        )}

        {isTyping && (
          <div className="flex items-end justify-end mb-4">
            <div className="bg-indigo-600 dark:bg-indigo-500 px-4 py-2.5 rounded-2xl rounded-tr-none shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce"></span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Scroll to Bottom Button (Enterprise Polish) */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-8 right-8 p-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-full shadow-[0_8px_25px_rgba(79,70,229,0.4)] hover:shadow-[0_12px_30px_rgba(79,70,229,0.5)] hover:scale-110 active:scale-95 transition-all duration-300 animate-in fade-in zoom-in slide-in-from-bottom-6 cursor-pointer z-[40] group overflow-visible"
          title="Bajar al final"
        >
          <ChevronDown size={24} className="group-hover:translate-y-0.5 transition-transform" />
          
          {/* Subtle Pulse Effect */}
          <span className="absolute inset-0 rounded-full animate-ping bg-indigo-400 opacity-20 pointer-events-none"></span>
        </button>
      )}
    </div>
  );
};
