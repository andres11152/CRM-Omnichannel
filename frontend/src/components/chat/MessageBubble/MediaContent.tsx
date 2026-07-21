import React from "react";
import { FileText, Download, MapPin, User as UserIcon, ExternalLink } from "lucide-react";
import { Message } from "@/types";
import { VoiceNotePlayer } from "../VoiceNotePlayer";
import { resolveMediaUrl } from "./helpers";
import { UnavailableMediaFallback } from "./UnavailableMediaFallback";

interface MediaContentProps {
  message: Message;
  mediaUrl: string | undefined;
  msgType: string;
  isAgent: boolean;
  groupedMessages?: Message[];
  onImageClick?: (mediaUrl: string) => void;
}

/**
 * Renders all non-text message payloads: grouped image albums, stickers,
 * images, videos, audio notes, documents, locations, and contact cards.
 */
export const MediaContent: React.FC<MediaContentProps> = ({
  message,
  mediaUrl,
  msgType,
  isAgent,
  groupedMessages,
  onImageClick,
}) => {
  if (groupedMessages && groupedMessages.length > 1) {
    const total = groupedMessages.length;
    const showCount = Math.min(total, 4);
    const remaining = total - showCount;
    // Layout: 2 = 1 row of 2, 3 = row of 2 + row of 1 (span-2), 4+ = 2x2 grid
    const gridClass = showCount <= 2 ? "grid-cols-2" : "grid-cols-2";

    return (
      <div className={`grid ${gridClass} gap-0.5 mb-1 rounded-lg overflow-hidden max-w-[320px]`}>
        {groupedMessages.slice(0, showCount).map((msg, idx) => {
          const groupMediaUrl = (msg.mediaUrl as string) || (msg.metadata?.media as { url?: string })?.url;
          const isLast = idx === showCount - 1;
          const showOverlay = isLast && remaining > 0;
          // For 3 images: make the third image span full width
          const spanFull = total === 3 && idx === 2;

          return (
            <div
              key={msg.id}
              className={`relative overflow-hidden cursor-pointer group/media hover:brightness-90 transition-all ${
                spanFull ? "col-span-2 aspect-[2/1]" : "aspect-square"
              }`}
              onClick={() =>
                onImageClick
                  ? onImageClick(resolveMediaUrl(groupMediaUrl))
                  : window.open(resolveMediaUrl(groupMediaUrl), "_blank")
              }
            >
              <img
                src={resolveMediaUrl(groupMediaUrl)}
                className="w-full h-full object-cover"
                alt="Media"
                loading="lazy"
              />
              {/* +N remaining overlay */}
              {showOverlay && (
                <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                  <span className="text-white text-3xl font-bold drop-shadow-lg">+{remaining}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {msgType === "sticker" &&
        (mediaUrl ? (
          <img
            src={resolveMediaUrl(mediaUrl)}
            alt="Sticker"
            className="mb-1 max-w-[180px] max-h-[180px] object-contain cursor-pointer hover:scale-105 transition-transform drop-shadow-md"
            onClick={() => (onImageClick ? onImageClick(resolveMediaUrl(mediaUrl)) : window.open(resolveMediaUrl(mediaUrl), "_blank"))}
            loading="lazy"
          />
        ) : (
          <UnavailableMediaFallback message={message} type="sticker" />
        ))}

      {(msgType === "image" || msgType === "image_unavailable") &&
        (mediaUrl ? (
          <img
            src={resolveMediaUrl(mediaUrl)}
            alt="Imagen"
            className="rounded-lg mb-1 max-w-[300px] max-h-[350px] object-cover cursor-pointer hover:opacity-90 transition-opacity shadow-sm border border-black/5 dark:border-white/5"
            onClick={() => (onImageClick ? onImageClick(resolveMediaUrl(mediaUrl)) : window.open(resolveMediaUrl(mediaUrl), "_blank"))}
            loading="lazy"
          />
        ) : (
          <UnavailableMediaFallback message={message} type="image" />
        ))}

      {(msgType === "video" || msgType === "video_unavailable") &&
        (mediaUrl ? (
          <video src={resolveMediaUrl(mediaUrl)} controls className="rounded-lg mb-1 max-w-[300px] max-h-[350px] shadow-sm" />
        ) : (
          <UnavailableMediaFallback message={message} type="video" />
        ))}

      {(msgType === "audio" || msgType === "audio_unavailable") &&
        (mediaUrl ? (
          <VoiceNotePlayer url={resolveMediaUrl(mediaUrl)} isAgent={isAgent} />
        ) : (
          <UnavailableMediaFallback message={message} type="audio" />
        ))}

      {(msgType === "document" || msgType === "document_unavailable") &&
        (mediaUrl ? (
          <div
            onClick={() => {
              const fullUrl = resolveMediaUrl(mediaUrl);
              window.open(fullUrl, "_blank");
            }}
            className={`flex items-center gap-3 p-2.5 rounded-xl mb-1 cursor-pointer transition-colors shadow-sm ${
              isAgent ? "bg-black/10 hover:bg-black/20" : "bg-white dark:bg-reply-surface-dark hover:bg-gray-50 dark:hover:bg-[#182329]"
            }`}
            title="Descargar o ver archivo"
          >
            {/* Icon Box */}
            <div
              className={`p-2.5 rounded-lg flex items-center justify-center shrink-0 ${
                isAgent ? "bg-white/20 text-white" : "bg-red-50 dark:bg-red-500/10 text-red-500"
              }`}
            >
              <FileText className="w-6 h-6" />
            </div>

            {/* File Info */}
            <div className="flex flex-col overflow-hidden min-w-[150px] max-w-[200px] flex-1">
              <span className={`text-[13.5px] font-medium truncate ${isAgent ? "text-white" : "text-gray-900 dark:text-gray-100"}`}>
                {(() => {
                  const media = message.metadata?.media as { url?: string; filename?: string; mimetype?: string } | undefined;
                  const urlPath = media?.url || mediaUrl || "";
                  const fromUrl = urlPath.split("/").pop()?.split("?")[0] || "";
                  return media?.filename || fromUrl || message.content || "Archivo";
                })()}
              </span>
              <div className={`flex items-center gap-1.5 mt-0.5 text-[11px] uppercase tracking-wider font-semibold ${isAgent ? "text-white/70" : "text-gray-500"}`}>
                <span>
                  {(() => {
                    const media = message.metadata?.media as { url?: string; mimetype?: string; size?: number } | undefined;
                    const urlPath = media?.url || mediaUrl || "";
                    const ext = urlPath.split(".").pop()?.split("?")[0]?.toUpperCase();
                    if (ext && ext.length <= 5 && ext.length >= 2) return ext;
                    const mime = media?.mimetype || "";
                    if (mime.includes("pdf")) return "PDF";
                    if (mime.includes("mp4") || mime.includes("video")) return "MP4";
                    if (mime.includes("doc")) return "DOCX";
                    if (mime.includes("xls")) return "XLSX";
                    return "ARCHIVO";
                  })()}
                </span>
                <span>•</span>
                <span>
                  {(() => {
                    const media = message.metadata?.media as { size?: number } | undefined;
                    const size = media?.size;
                    if (!size) return "Documento";
                    if (size > 1048576) return `${(size / 1048576).toFixed(1)} MB`;
                    return `${Math.round(size / 1024)} KB`;
                  })()}
                </span>
              </div>
            </div>

            {/* Download Icon */}
            <div className={`p-2 rounded-full shrink-0 ${isAgent ? "hover:bg-white/10" : "hover:bg-gray-100 dark:hover:bg-white/5"}`}>
              <Download className="w-5 h-5 opacity-70" />
            </div>
          </div>
        ) : (
          <UnavailableMediaFallback message={message} type="document" />
        ))}

      {/* Location Message */}
      {msgType === "location" &&
        (() => {
          const loc = message.metadata?.location as
            | { latitude: number; longitude: number; name?: string; address?: string }
            | undefined;
          if (!loc) return null;
          const mapsUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
          const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${loc.latitude},${loc.longitude}&zoom=15&size=280x140&markers=${loc.latitude},${loc.longitude}`;
          return (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-1 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 hover:opacity-90 transition-opacity"
            >
              <div className="relative bg-gray-100 dark:bg-white/5 flex items-center justify-center h-[100px]">
                <img
                  src={staticMapUrl}
                  alt="Mapa"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <MapPin className="w-6 h-6 text-red-500 absolute drop-shadow" />
              </div>
              <div className={`flex items-center gap-1.5 p-2 text-xs font-medium ${isAgent ? "bg-black/10" : "bg-white dark:bg-reply-surface-dark"}`}>
                <span className="truncate flex-1">{loc.name || loc.address || "Ver ubicación"}</span>
                <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
              </div>
            </a>
          );
        })()}

      {/* Contact Card Message */}
      {msgType === "contact" &&
        (() => {
          const contact = message.metadata?.contact as { name: string; phone: string } | undefined;
          if (!contact) return null;
          return (
            <div className={`flex items-center gap-3 p-2.5 rounded-xl mb-1 ${isAgent ? "bg-black/10" : "bg-white dark:bg-reply-surface-dark"}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isAgent ? "bg-white/20" : "bg-indigo-100 dark:bg-indigo-900/40"}`}>
                <UserIcon className={`w-5 h-5 ${isAgent ? "text-white" : "text-indigo-600 dark:text-indigo-400"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium truncate">{contact.name}</p>
                <p className={`text-[11px] ${isAgent ? "text-white/70" : "text-gray-500"}`}>{contact.phone}</p>
              </div>
            </div>
          );
        })()}
    </>
  );
};
