import React from "react";
import { Media } from "@/services/mediaService";

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

import { Image, Mic, Video, FileText, Folder } from "lucide-react";

export const getFileIcon = (type: string): React.ReactNode => {
  switch (type) {
    case "IMAGE":
      return React.createElement(Image, { className: "w-4 h-4 text-white" });
    case "AUDIO":
      return React.createElement(Mic, { className: "w-4 h-4 text-white" });
    case "VIDEO":
      return React.createElement(Video, { className: "w-4 h-4 text-white" });
    case "DOCUMENT":
      return React.createElement(FileText, { className: "w-4 h-4 text-white" });
    default:
      return React.createElement(Folder, { className: "w-4 h-4 text-white" });
  }
};

// Helper for broken images - with debug logging
export const addDefaultSrc = (ev: React.SyntheticEvent<HTMLImageElement, Event>) => {
  const originalSrc = ev.currentTarget.src;
  console.error("[MediaLibrary] Image failed to load:", originalSrc);
  ev.currentTarget.src =
    "https://ui-avatars.com/api/?name=Error&background=ef4444&color=fff";
};

// Helper to get file extension from URL or mimeType
export const getFileExtension = (item: Media): string => {
  // For proxy URLs, use mimeType to determine extension
  if (item.url.includes("/content")) {
    const mimeMap: Record<string, string> = {
      "image/jpeg": "JPG",
      "image/jpg": "JPG",
      "image/png": "PNG",
      "image/gif": "GIF",
      "image/webp": "WEBP",
      "audio/ogg": "OGG",
      "audio/mpeg": "MP3",
      "audio/wav": "WAV",
      "video/mp4": "MP4",
      "video/webm": "WEBM",
      "application/pdf": "PDF",
    };
    return (
      mimeMap[item.mimeType] ||
      item.mimeType.split("/")[1]?.toUpperCase() ||
      "FILE"
    );
  }
  // For direct URLs, extract from filename
  return item.originalName.split(".").pop()?.toUpperCase() || "FILE";
};
