import React from "react";
import { useTranslation } from "react-i18next";
import { Pencil, FileText } from "lucide-react";
import { Media } from "@/services/mediaService";
import { formatFileSize, getFileExtension, addDefaultSrc } from "./helpers";

interface MediaCardProps {
  item: Media;
  isSelected: boolean;
  hasSelection: boolean;
  onOpen: (item: Media) => void;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onCopyUrl: (url: string) => void;
  onRename: (item: Media) => void;
  onDelete: (id: string) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  isSelected,
  hasSelection,
  onOpen,
  onToggleSelect,
  onCopyUrl,
  onRename,
  onDelete,
}) => {
  const { t } = useTranslation();
  return (
    <div
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || hasSelection) {
          onToggleSelect(item.id, e);
        } else {
          onOpen(item);
        }
      }}
      className={`group relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden ring-1 ${
        isSelected
          ? "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/10 -translate-y-1"
          : "ring-gray-100 dark:ring-gray-700 hover:ring-purple-500/50 hover:-translate-y-1"
      }`}
    >
      {/* Selection Checkbox (Top Left) */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(item.id);
        }}
        className={`absolute top-3 left-3 z-20 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
          isSelected
            ? "bg-purple-600 border-purple-600 text-white scale-110 shadow-lg shadow-purple-500/40"
            : "bg-white/10 backdrop-blur-md border-white/40 opacity-0 group-hover:opacity-100"
        }`}
      >
        {isSelected && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Media Preview Aspect Ratio 1:1 */}
      <div className="aspect-square relative bg-gray-100 dark:bg-gray-900 overflow-hidden">
        {item.type === "IMAGE" ? (
          <img
            src={item.url}
            onError={addDefaultSrc}
            alt={item.originalName}
            className={`w-full h-full object-cover transition-all duration-500 ${
              isSelected ? "scale-95 opacity-80" : "group-hover:scale-105"
            }`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 group-hover:text-purple-500 transition-colors">
            {item.type === "VIDEO" ? (
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ) : item.type === "AUDIO" ? (
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            ) : (
              <FileText className="w-12 h-12 text-gray-400 dark:text-gray-600" />
            )}
            <span className="text-xs font-bold mt-2 uppercase tracking-wide opacity-50">{item.type}</span>
          </div>
        )}

        {/* Hover Overlay with Quick Actions */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopyUrl(item.url);
            }}
            className="p-2 bg-white/20 hover:bg-white text-white hover:text-purple-600 rounded-full backdrop-blur-md transition-all transform hover:scale-110"
            title={t("media_library.card.copy_link", "Copiar Link")}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename(item);
            }}
            className="p-2 bg-white/20 hover:bg-white text-white hover:text-purple-600 rounded-full backdrop-blur-md transition-all transform hover:scale-110"
            title={t("media_library.card.rename", "Renombrar")}
          >
            <Pencil className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-all transform hover:scale-110"
            title={t("media_library.card.delete", "Eliminar")}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate" title={item.originalName}>
          {item.originalName}
        </h3>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-gray-400">{formatFileSize(item.size)}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded uppercase">
            {getFileExtension(item)}
          </span>
        </div>
      </div>
    </div>
  );
};
