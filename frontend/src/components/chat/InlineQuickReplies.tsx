import React, { useState, useEffect, useCallback } from "react";
import { QuickReply } from "@/types";
import { quickRepliesService } from "@/services/quickRepliesService";
import { Zap, MessageSquare, Search } from "lucide-react";

interface InlineQuickRepliesProps {
  query: string;
  onSelect: (content: string) => void;
  onClose: () => void;
}

export const InlineQuickReplies: React.FC<InlineQuickRepliesProps> = ({
  query,
  onSelect,
  onClose,
}) => {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [filtered, setFiltered] = useState<QuickReply[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReplies = async () => {
      try {
        setLoading(true);
        const data = await quickRepliesService.getQuickReplies();
        setReplies(data);
      } catch (err) {
        console.error("Failed to fetch quick replies", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReplies();
  }, []);

  useEffect(() => {
    const term = query.trim().toLowerCase();
    
    // [SEC] 100-YEAR FIX: Smart Filtering
    // Prioritize exactly what the user is looking for (shortcut > title > content)
    const matches = replies.filter((r) => {
      if (!term) return true; // Show all if just "/"
      
      const shortcutMatch = r.shortcut?.toLowerCase().includes(term);
      const titleMatch = r.title.toLowerCase().includes(term);
      const contentMatch = r.content.toLowerCase().includes(term);
      
      return shortcutMatch || titleMatch || contentMatch;
    });

    // Sort: items starting with the term first (predictive behavior)
    matches.sort((a, b) => {
      const aStarts = a.shortcut?.toLowerCase().startsWith(term) || a.title.toLowerCase().startsWith(term);
      const bStarts = b.shortcut?.toLowerCase().startsWith(term) || b.title.toLowerCase().startsWith(term);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    setFiltered(matches);
    setSelectedIndex(0);
  }, [query, replies]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      // [UX] Intercept keys only when the menu is active
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        // Only select if not using Shift+Enter (which should still allow new lines)
        if (!e.shiftKey) {
          e.preventDefault();
          onSelect(filtered[selectedIndex].content);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (loading && replies.length === 0) return null;
  if (!loading && filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-full max-w-[400px] bg-white dark:bg-reply-elevated-dark rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden z-[100] animate-in slide-in-from-bottom-2">
      <div className="px-3 py-2 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-indigo-500 fill-current" />
          <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Respuestas Rápidas</span>
        </div>
        {query && (
          <div className="flex items-center gap-1 text-[10px] text-indigo-500 font-bold bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">
            <Search className="w-2.5 h-2.5" />
            <span>"{query}"</span>
          </div>
        )}
      </div>
      
      <div className="max-h-[280px] overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
        {filtered.map((reply, index) => (
          <button
            key={reply.id}
            onClick={() => onSelect(reply.content)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`w-full flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl transition-all text-left ${
              index === selectedIndex
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 scale-[1.02] z-10"
                : "hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-sm font-bold truncate ${index === selectedIndex ? "text-white" : "text-gray-900 dark:text-white"}`}>
                {reply.title}
              </span>
              {reply.shortcut && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  index === selectedIndex ? "bg-white/20 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                }`}>
                  /{reply.shortcut}
                </span>
              )}
            </div>
            <p className={`text-xs line-clamp-1 opacity-80 ${index === selectedIndex ? "text-indigo-50" : "text-gray-500 dark:text-gray-400"}`}>
              {reply.content}
            </p>
          </button>
        ))}
      </div>
      
      <div className="px-3 py-2 bg-gray-50/50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-[10px] text-gray-400 font-medium">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-white/10 rounded">↑↓</kbd> Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-white/10 rounded">Enter</kbd> Seleccionar
          </span>
        </div>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-white/10 rounded">Esc</kbd> Cerrar
        </span>
      </div>
    </div>
  );
};
