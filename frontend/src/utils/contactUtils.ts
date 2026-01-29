import { Contact } from "../../types";

/**
 * 🧹 Sanitiza y resuelve el nombre a mostrar para un contacto.
 *
 * Principio: Single Responsibility (SRP) - Esta función solo sabe cómo formatear nombres.
 * No depende de React ni del estado de la UI.
 *
 * @param contact El objeto de contacto a resolver
 * @param fallbackSubject Asunto opcional para usar como respaldo si el nombre falla
 * @returns Nombre limpio y legible para humanos
 */
export const resolveContactName = (
  contact: Partial<Contact>,
  fallbackSubject?: string,
): string => {
  let name = contact.name || "";

  // 🛡️ Sanitize: Remove technical suffixes
  if (name) {
    name = name
      .replace("@s.whatsapp.net", "")
      .replace("@g.us", "")
      .replace(/:.*/, "");
  }

  // ULTIMATE SANITIZATION
  const normalized = (name || "").toLowerCase();
  const isInvalid =
    !name ||
    normalized.includes("unknown") ||
    normalized.includes("sin nombre") ||
    normalized.includes("usuario whatsapp") ||
    normalized.includes("usuario de whatsapp") ||
    normalized.trim() === "" ||
    /^\d+$/.test(normalized);

  if (isInvalid) {
    let phone = contact.phone ? String(contact.phone) : ""; // Force String

    // Try channelId if phone looks invalid or is missing
    if ((!phone || phone.includes("@")) && contact?.channelId) {
      const raw = String(contact.channelId)
        .replace("@s.whatsapp.net", "")
        .replace(/\D/g, "");
      // Filter LIDs (>13 digits)
      if (raw.length > 6 && raw.length <= 13) phone = raw;
    }

    // Try email as fallback for phone
    if (!phone && contact?.email) {
      const raw = String(contact.email).split("@")[0].replace(/\D/g, "");
      if (raw.length > 6) phone = raw;
    }

    // Try ID (JID often in ID)
    if ((!phone || phone.includes("@")) && contact?.id) {
      const raw = String(contact.id)
        .replace("@s.whatsapp.net", "")
        .replace(/\D/g, "");
      // Filter LIDs (>13 digits)
      if (raw.length > 6 && raw.length <= 13) phone = raw;
    }

    if (phone && phone.trim() !== "")
      return phone.startsWith("+") ? phone : `+${phone}`;

    // Try Subject as last resort
    if (
      fallbackSubject &&
      !fallbackSubject.toLowerCase().includes("unknown") &&
      fallbackSubject.trim() !== ""
    ) {
      return fallbackSubject;
    }

    return "Usuario WhatsApp";
  }
  return name || "Usuario WhatsApp";
};

/**
 * Obtiene las iniciales de un nombre para avatares.
 */
export const getInitials = (name: string): string => {
  const clean = name.replace(/^\+/, "").trim(); // Remove leading +
  return clean.charAt(0).toUpperCase();
};
