import { MediaType } from "@prisma/client";

/**
 * Returns a Spanish label for a given media type, wrapped in brackets.
 * Used for sidebar previews and message bubble fallbacks.
 */
export const getMediaPlaceholder = (type: MediaType | string | null | undefined): string => {
  if (!type) return "[ARCHIVO]";
  
  const normalized = String(type).toUpperCase();
  
  if (normalized.includes("IMAGE") || normalized === "IMAGE") return "[IMAGEN]";
  if (normalized.includes("VIDEO") || normalized === "VIDEO") return "[VIDEO]";
  if (normalized.includes("AUDIO") || normalized === "AUDIO") return "[AUDIO]";
  if (normalized.includes("STICKER")) return "[STICKER]";
  
  return "[DOCUMENTO]";
};
