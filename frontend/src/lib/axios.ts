import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from "axios";
import { useAuthStore } from "@/stores/authStore";

// Generic API Response Interface (matches backend standard)
export interface ApiResponse<T = unknown> {
  status: "success" | "fail" | "error";
  data: T;
  token?: string; // Auth token is returned at root level
  message?: string;
  results?: number; // Optional count for list endpoints
}

// Error rejected by the response interceptor below. Carries the original
// HTTP status code so callers can branch (e.g. 403 "feature disabled" vs
// 500 "server error") without re-parsing the message string.
export interface ApiError extends Error {
  status?: number;
}

const makeApiError = (message: string, status?: number): ApiError => {
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
};

// Base URL configuration
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

/**
 *  ENTERPRISE HTTP CLIENT
 * Features:
 * - HttpOnly cookie auth (XSS-proof)
 * - Automatic token refresh on 401
 * - Bearer header fallback (backward compatible)
 * - Centralized error handling
 */
export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  //  ENTERPRISE: Send HttpOnly cookies with every request
  withCredentials: true,
  // 15s timeout to handle slow network but fail before user gives up
  timeout: 15000,
});

// ============================================================================
//  REQUEST INTERCEPTOR: AUTOMATIC TOKEN INJECTION
// ============================================================================
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Read from State Store (Single Source of Truth)
    // Still send Bearer header for backward compatibility (Postman, mobile)
    const token = useAuthStore.getState().token;

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // [SEC] FormData Detection: Let axios auto-generate multipart boundary
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
// [SYNC] TOKEN REFRESH QUEUE (Prevents multiple concurrent refresh calls)
// ============================================================================

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// ============================================================================
// [ALERT] RESPONSE INTERCEPTOR: AUTO-REFRESH + CENTRALIZED ERROR HANDLING
// ============================================================================
api.interceptors.response.use(
  (response: AxiosResponse) => {
    if (response.status === 204) return response;
    return response;
  },
  async (error: AxiosError<{ message?: string }>) => {
    const { response, config } = error;
    const originalRequest = config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const errorMessage =
      response?.data?.message ||
      response?.statusText ||
      "Error de conexión con el servidor";

    // --- CASE 1: 401 UNAUTHORIZED ---
    if (response?.status === 401) {
      const requestUrl = originalRequest?.url || "";

      // Skip refresh for login/refresh endpoints (prevent infinite loop)
      if (
        requestUrl.includes("/auth/login") ||
        requestUrl.includes("/auth/refresh") ||
        requestUrl.includes("login")
      ) {
        return Promise.reject(error);
      }

      // [SYNC] ENTERPRISE: Attempt silent token refresh
      if (!originalRequest._retry) {
        if (isRefreshing) {
          // Queue this request while refresh is in progress
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((newToken) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              return api(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Call refresh endpoint (uses refresh_token cookie automatically)
          const refreshResponse = await axios.post(
            `${BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true },
          );

          const newToken = refreshResponse.data.token;

          // Update store with new access token
          useAuthStore.getState().updateToken(newToken);

          // Process queued requests
          processQueue(null, newToken);

          // Retry original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed → full logout
          processQueue(new Error("Session expired"), null);
          console.warn("[Axios]  Refresh failed. Forcing logout...");
          useAuthStore.getState().logout();
          return Promise.reject(
            new Error(
              "Tu sesión ha expirado. Por favor inicia sesión nuevamente.",
            ),
          );
        } finally {
          isRefreshing = false;
        }
      }

      // Already retried and still 401 → logout
      useAuthStore.getState().logout();
      return Promise.reject(
        new Error("Tu sesión ha expirado. Por favor inicia sesión nuevamente."),
      );
    }

    // --- CASE 2: 429 RATE LIMIT EXCEEDED ---
    if (response?.status === 429) {
      console.error("[Axios] 429 Rate Limit Reached");
      return Promise.reject(
        makeApiError(
          "Has superado el límite de solicitudes. Por favor espera unos segundos.",
          429,
        ),
      );
    }

    // --- CASE 3: 500+ SERVER ERRORS ---
    if (response && response.status >= 500) {
      console.error("[Axios] 500 Server Error:", errorMessage);
      return Promise.reject(
        makeApiError(
          "Error interno del servidor. Nuestro equipo ha sido notificado.",
          response.status,
        ),
      );
    }

    return Promise.reject(makeApiError(errorMessage, response?.status));
  },
);
