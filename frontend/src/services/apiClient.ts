import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from "axios";
import { toast } from "sonner";

// Extend the request config with an opt-out for the global error toast
// below. Use this for calls the caller already handles/expects to fail
// (e.g. an optional feature gated behind a company feature flag) so the
// interceptor doesn't surface a raw backend error message the user can't
// act on.
export interface ApiRequestConfig extends AxiosRequestConfig {
  skipErrorToast?: boolean;
}

// ==================== CONFIG ====================

// Use relative path in development (Vite proxy handles the rest)
// In production, use full URL from env variable
const API_BASE_URL = import.meta.env.DEV
  ? "/api"
  : (import.meta.env.VITE_API_URL || "http://localhost:4000")
      .replace(/\/api\/?$/, "")
      .replace(/\/$/, "") + "/api";

// ==================== AXIOS INSTANCE ====================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ==================== REQUEST INTERCEPTOR ====================

/**
 * Inject authentication token automatically
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// ==================== RESPONSE INTERCEPTOR ====================

/**
 * Handle global error responses
 */
apiClient.interceptors.response.use(
  (response) => {
    // Success: Return data directly
    return response.data;
  },
  (error: AxiosError) => {
    const skipErrorToast = Boolean(
      (error.config as ApiRequestConfig | undefined)?.skipErrorToast,
    );

    // Error handling
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as {
        message?: string;
        [key: string]: unknown;
      };

      // Handle specific status codes
      switch (status) {
        case 401:
          // Unauthorized: Clear token and redirect to login
          localStorage.removeItem("token");
          localStorage.removeItem("auth-storage");

          // Only show toast if not already on login page
          if (!window.location.pathname.includes("/login")) {
            toast.error(
              "Sesión expirada. Por favor, inicia sesión nuevamente.",
            );
            setTimeout(() => {
              window.location.href = "/login";
            }, 1500);
          }
          break;

        case 403:
          // Forbidden
          if (!skipErrorToast) {
            toast.error(
              data.message || "No tienes permisos para realizar esta acción.",
            );
          }
          break;

        case 404:
          // Not found - Don't show toast, let component handle it
          break;

        case 500:
          if (!skipErrorToast) {
            toast.error(
              "Error del servidor. Por favor, intenta de nuevo ms tarde.",
            );
          }
          break;

        default:
          // Generic error
          if (data.message && !skipErrorToast) {
            toast.error(data.message);
          }
      }

      // Reject with structured error
      return Promise.reject({
        status,
        message: data.message || "Request failed",
        data: data,
      });
    } else if (error.request) {
      // Network error
      if (!skipErrorToast) {
        toast.error("Error de conexión. Verifica tu internet.");
      }
      return Promise.reject({
        status: 0,
        message: "Network error",
        data: null,
      });
    } else {
      // Other errors
      return Promise.reject({
        status: 0,
        message: error.message,
        data: null,
      });
    }
  },
);

// ==================== TYPED API CLIENT ====================

/**
 * Type-safe API client interface
 */
export const api = {
  get: <T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> => {
    return apiClient.get(url, config);
  },

  post: <T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiRequestConfig,
  ): Promise<T> => {
    return apiClient.post(url, data, config);
  },

  put: <T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiRequestConfig,
  ): Promise<T> => {
    return apiClient.put(url, data, config);
  },

  patch: <T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiRequestConfig,
  ): Promise<T> => {
    return apiClient.patch(url, data, config);
  },

  delete: <T = unknown>(
    url: string,
    config?: ApiRequestConfig,
  ): Promise<T> => {
    return apiClient.delete(url, config);
  },
};

// Export the instance for advanced usage
export default apiClient;
