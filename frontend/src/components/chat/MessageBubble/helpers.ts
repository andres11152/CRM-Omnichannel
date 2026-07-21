import { jwtDecode } from "jwt-decode";

// Cache token decoding for performance
let cachedUserId: string | null = null;
export const getCurrentUserId = () => {
  if (cachedUserId) return cachedUserId;
  try {
    const token = localStorage.getItem("token");
    if (token) {
      cachedUserId = (jwtDecode<{ id: string }>(token)).id;
      return cachedUserId;
    }
  } catch {
    // malformed/expired token — falls through to the "me" fallback below
  }
  return "me"; // fallback
};

// Ensure mediaUrls are absolute to avoid React Router catching relative paths
export const resolveMediaUrl = (url: string | undefined): string => {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("blob:") || url.startsWith("data:")) return url;

  // Resolve relative URL against API server
  const apiUrl = import.meta.env.DEV
    ? "http://localhost:4000"
    : (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/api\/?$/, "").replace(/\/$/, "");

  return `${apiUrl}${url.startsWith("/") ? "" : "/"}${url}`;
};

/**
 * HELPER: Format timestamp
 */
export const formatTime = (timestamp: string | Date): string => {
  if (!timestamp) return "";
  const date = new Date(timestamp);

  // Check for Invalid Date
  if (isNaN(date.getTime())) {
    return "";
  }

  // Always show only time (HH:mm) to save space and avoid redundancy
  // since DateDividers already show the date context.
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

// Consistent color gen for group participant names
const NAME_COLORS = ["#e542a3", "#029d00", "#3498db", "#e67e22", "#9b59b6", "#1abc9c", "#e74c3c"];
const stringToHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return hash;
};
export const getNameColor = (name: string | undefined): string | undefined =>
  name ? NAME_COLORS[Math.abs(stringToHash(name)) % NAME_COLORS.length] : undefined;
