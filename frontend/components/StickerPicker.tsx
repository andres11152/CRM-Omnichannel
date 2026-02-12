import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { getMedia, Media } from "../services/mediaService";
import { BASE_URL } from "../services/apiConfig";
import { Smile, Sticker, Search, X } from "lucide-react";

interface StickerPickerProps {
  onSelect: (sticker: Media) => void;
  onEmojiSelect?: (emoji: EmojiClickData) => void;
  onClose: () => void;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({
  onSelect,
  onEmojiSelect,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"emoji" | "sticker">("emoji");
  const [stickers, setStickers] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Dynamic Dark Mode Detection
    const checkDarkMode = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    checkDarkMode();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          checkDarkMode();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (activeTab === "sticker") {
      loadStickers();
    }
  }, [activeTab]);

  const loadStickers = async () => {
    if (stickers.length > 0) return; // Cache check
    try {
      setLoading(true);
      const data = await getMedia({ category: "STICKER" }); // Assuming backend supports this category
      setStickers(data.media);
    } catch (error: any) {
      console.error(error);
      toast.error("Error al cargar stickers");
    } finally {
      setLoading(false);
    }
  };

  const filteredStickers = stickers.filter((s) =>
    s.originalName?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="absolute bottom-full left-0 mb-3 ml-2 w-[calc(100vw-24px)] xs:w-[320px] sm:w-[350px] h-[60vh] xs:h-[400px] sm:h-[450px] bg-white/95 dark:bg-[#1f2c34]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col z-50 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 origin-bottom-left">
      {/* Premium Header Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 sm:p-2 bg-gray-50/50 dark:bg-[#111b21]/50 border-b border-gray-100 dark:border-gray-800">
        <div className="flex-1 flex bg-gray-200/50 dark:bg-gray-800/50 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("emoji")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "emoji"
                ? "bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <Smile className="w-4 h-4" /> Emojis
          </button>
          <button
            onClick={() => setActiveTab("sticker")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "sticker"
                ? "bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <Sticker className="w-4 h-4" /> Stickers
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "emoji" ? (
          <div className="h-full w-full">
            <EmojiPicker
              onEmojiClick={(emoji) => onEmojiSelect?.(emoji)}
              autoFocusSearch={false}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              width="100%"
              height="100%"
              previewConfig={{ showPreview: false }}
              skinTonesDisabled
              searchDisabled={false}
              lazyLoadEmojis={true}
            />
          </div>
        ) : (
          <div className="flex flex-col h-full bg-gray-50 dark:bg-[#0b141a]">
            {/* Sticker Search Bar */}
            <div className="p-2 sm:p-3 bg-white dark:bg-[#1f2c34] border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar stickers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-[#111b21] rounded-xl text-sm text-gray-800 dark:text-white border-none focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Sticker Grid */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 custom-scrollbar">
              {loading ? (
                <div className="flex justify-center p-8">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : filteredStickers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4 select-none">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <Sticker className="w-8 h-8 opacity-40" />
                  </div>
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                    No hay stickers
                  </p>
                  <p className="text-xs opacity-60 mt-1 max-w-[200px]">
                    Guarda stickers haciendo click derecho en el chat
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {filteredStickers.map((sticker) => (
                    <div
                      key={sticker.id}
                      onClick={() => onSelect(sticker)}
                      className="aspect-square bg-white dark:bg-[#202c33] rounded-xl border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-500 transition-all hover:scale-105 active:scale-95 flex items-center justify-center relative group select-none shadow-sm hover:shadow-md overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-0"></div>
                      <img
                        src={
                          sticker.url.startsWith("http")
                            ? sticker.url
                            : `${BASE_URL}${sticker.url}`
                        }
                        alt="Sticker"
                        className="w-full h-full object-contain p-2 pointer-events-none relative z-10"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
