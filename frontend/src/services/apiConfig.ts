// Normalize URL to remove trailing slash or /api suffix to avoid duplication
const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
export const BASE_URL = rawUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
export const API_BASE_URL = `${BASE_URL}/api`;

export async function fetchAPI<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ message: "Request failed" }))) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // Handle empty responses (e.g., 204 No Content)
  const contentLength = response.headers.get("content-length");
  if (response.status === 204 || contentLength === "0") {
    return null as T;
  }

  return response.json() as Promise<T>;
}
