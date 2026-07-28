import React from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import EmojiPicker, { Categories, Theme } from "emoji-picker-react";
import { Message } from "@/types";
import { getCurrentUserId } from "./helpers";

const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
type MessageReaction = NonNullable<Message["reactions"]>[number];

interface ReactionPickerProps {
  isAgent: boolean;
  isDark: boolean;
  reactions: MessageReaction[];
  showFullPicker: boolean;
  onReact: (emoji: string) => void;
  onOpenFullPicker: () => void;
  onCloseFullPicker: () => void;
}

/**
 * The quick-emoji popover plus full emoji picker with i18n language support.
 */
export const ReactionPicker: React.FC<ReactionPickerProps & { onClose?: () => void }> = ({
  isAgent,
  isDark,
  reactions,
  showFullPicker,
  onReact,
  onOpenFullPicker,
  onCloseFullPicker,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const isSpanish = i18n.language?.startsWith("es");

  const categories = isSpanish
    ? [
        { category: Categories.SUGGESTED, name: t("emoji_picker.categories.suggested", "Usados con frecuencia") },
        { category: Categories.SMILEYS_PEOPLE, name: t("emoji_picker.categories.smileys", "Emoticonos y personas") },
        { category: Categories.ANIMALS_NATURE, name: t("emoji_picker.categories.animals", "Animales y naturaleza") },
        { category: Categories.FOOD_DRINK, name: t("emoji_picker.categories.food", "Comida y bebida") },
        { category: Categories.TRAVEL_PLACES, name: t("emoji_picker.categories.travel", "Viajes y lugares") },
        { category: Categories.ACTIVITIES, name: t("emoji_picker.categories.activities", "Actividades") },
        { category: Categories.OBJECTS, name: t("emoji_picker.categories.objects", "Objetos") },
        { category: Categories.SYMBOLS, name: t("emoji_picker.categories.symbols", "Símbolos") },
        { category: Categories.FLAGS, name: t("emoji_picker.categories.flags", "Banderas") },
      ]
    : undefined;



  return (
    <>
      {!showFullPicker && (
        <div
          className={`absolute bottom-full mb-2 ${
            isAgent ? "right-0 sm:right-0" : "left-0 sm:left-0"
          } z-50 bg-white/95 dark:bg-[#233138]/95 backdrop-blur-xl rounded-full shadow-xl border border-gray-200/60 dark:border-white/10 p-1.5 flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap max-w-[calc(100vw-32px)] overflow-x-auto custom-scrollbar`}
        >
          {QUICK_EMOJIS.map((emoji) => {
            const currentUserId = getCurrentUserId();
            const hasMyReact = reactions.some(
              (r) => r.content === emoji && (r.reactBy === "me" || r.isMe || r.reactBy === currentUserId)
            );
            return (
              <button
                key={emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(emoji);
                }}
                className={`text-xl hover:scale-125 hover:-translate-y-1 active:scale-95 transition-all duration-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 ${
                  hasMyReact ? "bg-indigo-100 dark:bg-indigo-500/30" : ""
                }`}
                title={hasMyReact ? t("emoji_picker.remove", "Quitar reacción") : t("emoji_picker.react", "Reaccionar")}
              >
                {emoji}
              </button>
            );
          })}
          <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullPicker();
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-600 text-gray-500 dark:text-gray-400 transition-all duration-200 shadow-sm"
            title={t("emoji_picker.more", "Más emojis")}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {showFullPicker && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            onCloseFullPicker();
            if (onClose) onClose();
          }}
        >
          <div className="relative animate-in zoom-in-95 duration-200 max-w-full max-h-[90vh] overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <EmojiPicker
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              searchPlaceHolder={t("emoji_picker.search_placeholder", isSpanish ? "Buscar emoji..." : "Search emoji...")}
              categories={categories}
              width="100%"
              height={typeof window !== "undefined" && window.innerHeight < 600 ? 320 : 380}
              onEmojiClick={(emojiData) => {
                onReact(emojiData.emoji);
                onCloseFullPicker();
                if (onClose) onClose();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};
