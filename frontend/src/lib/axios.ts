import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from "axios";
import { useAuthStore } from "@/stores/authStore";

// Generic API Response Interface (matches backend standard)
export interface ApiResponse<T = any> {
  status: "success" | "fail" | "error";
  data: T;
  token?: string; // Auth token is returned at root level
  message?: string;
  results?: number; // Optional count for list endpoints
}

// Base URL configuration
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

/**
 * 🚀 INTELLIGENT HTTP CLIENT
 * Configured with smart interceptors for Auth and Error handling.
 */
export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // 15s timeout to handle slow network but fail before user gives up
  timeout: 15000,
});

// ============================================================================
// 🔒 REQUEST INTERCEPTOR: AUTOMATIC TOKEN INJECTION
// ============================================================================
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Read from State Store (Single Source of Truth)
    // Works because persist middleware with localStorage is synchronous by default
    const token = useAuthStore.getState().token;

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 🛡️ FormData Detection: Let axios auto-generate multipart boundary
    // If we keep "application/json" for FormData uploads, the server can't parse the file.
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// ============================================================================
// 🚨 RESPONSE INTERCEPTOR: CENTRALIZED ERROR HANDLING
// ============================================================================
api.interceptors.response.use(
  (response: AxiosResponse) => {
    if (response.status === 204) return response;
    return response;
  },
  async (error: AxiosError<any>) => {
    const { response } = error;
    const errorMessage =
      response?.data?.message ||
      response?.statusText ||
      "Error de conexión con el servidor";

    // --- CASE 1: 401 UNAUTHORIZED (Token Expired/Invalid) ---
    if (response?.status === 401) {
      // 🔒 SKIP LOGOUT FOR LOGIN: Allow 401 on login to pass through so the UI handles it
      const requestUrl = error.config?.url || "";
      if (requestUrl.includes("/auth/login") || requestUrl.includes("login")) {
        console.warn(
          "[Axios] 401 on Login (Invalid Credentials) - Skipping logout",
        );
        return Promise.reject(error); // Pass original error to LoginPage
      }

      console.warn("[Axios] 401 Session Expired. Triggering logout...");

      // Use Store Action for Clean Logout (clears state, storage, and redirects)
      useAuthStore.getState().logout();

      return Promise.reject(
        new Error("Tu sesión ha expirado. Por favor inicia sesión nuevamente."),
      );
    }

    // --- CASE 2: 429 RATE LIMIT EXCEEDED ---
    if (response?.status === 429) {
      console.error("[Axios] 429 Rate Limit Reached");
      return Promise.reject(
        new Error(
          "Has superado el límite de solicitudes. Por favor espera unos segundos.",
        ),
      );
    }

    // --- CASE 3: 500+ SERVER ERRORS ---
    if (response && response.status >= 500) {
      console.error("[Axios] 500 Server Error:", errorMessage);
      return Promise.reject(
        new Error(
          "Error interno del servidor. Nuestro equipo ha sido notificado.",
        ),
      );
    }

    return Promise.reject(new Error(errorMessage));
  },
);
